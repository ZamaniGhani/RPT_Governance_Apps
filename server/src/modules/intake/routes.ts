import { Router } from 'express';
import multer from 'multer';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { pool, withTransaction } from '../../db.js';
import { actorFromRequest } from '../../shared/actor.js';
import { requireDepartment } from '../auth/index.js';
import { HttpError } from '../../shared/httpError.js';
import { KIND_OPTIONS, ROUTE_VERSION } from './types.js';
import { insertDocument } from './repository.js';
import { getCaseSummary, listCaseSummaries } from './summary.js';
import { decideCase, reopenCase, submitCase } from './service.js';
import { getCurrentRuleSet } from '../materiality/index.js';

export const intakeRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const numberOrNull = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  });

const submitSchema = z.object({
  party: z.string().trim().min(1),
  partyType: z.enum(['Person', 'Entity']).default('Entity'),
  basisLabel: z.string().trim().min(1).nullable().optional(),
  nature: z.string().trim().min(1),
  kind: z.enum(['rpt_one_off', 'rrpt', 'rpt_recurring_non_ordinary']),
  transactionDate: z.string().trim().min(1).nullable().optional(),
  considerationMyr: z.number().positive(),
  financials: z.object({
    netAssets: numberOrNull,
    totalAssets: numberOrNull,
    profitBeforeTax: numberOrNull,
    marketCap: numberOrNull,
  }),
  financialDocumentId: z.string().uuid().nullable().optional(),
});

intakeRouter.get('/intake-meta', async (_req, res, next) => {
  try {
    const ruleSet = await getCurrentRuleSet(pool);
    res.json({
      kindOptions: KIND_OPTIONS,
      routeVersion: ROUTE_VERSION,
      ruleSet: { version: ruleSet.version, effectiveFrom: ruleSet.effective_from, thresholds: ruleSet.thresholds },
    });
  } catch (err) {
    next(err);
  }
});

intakeRouter.get('/cases', async (_req, res, next) => {
  try {
    res.json(await listCaseSummaries(pool));
  } catch (err) {
    next(err);
  }
});

intakeRouter.get('/cases/:id', async (req, res, next) => {
  try {
    const summary = await getCaseSummary(pool, req.params.id!);
    if (!summary) throw new HttpError(404, 'Case not found');
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

intakeRouter.post('/cases', requireDepartment('finance'), async (req, res, next) => {
  try {
    const input = submitSchema.parse(req.body);
    const actor = actorFromRequest(req);
    const result = await submitCase(
      {
        party: input.party,
        partyType: input.partyType,
        basisLabel: input.basisLabel ?? null,
        nature: input.nature,
        kind: input.kind,
        transactionDate: input.transactionDate ?? null,
        considerationMyr: input.considerationMyr,
        financials: input.financials,
        financialDocumentId: input.financialDocumentId ?? null,
      },
      actor
    );
    const summary = await getCaseSummary(pool, result.caseId);
    res.status(201).json({ case: summary, isNewParty: result.isNewParty });
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(422, err.issues.map((i) => i.message).join('; ')));
    next(err);
  }
});

const decisionSchema = z.object({
  decision: z.enum(['approve', 'reject', 'refer']),
  rationale: z.string().trim().nullable().optional(),
});

intakeRouter.post('/cases/:id/decision', requireDepartment('compliance'), async (req, res, next) => {
  try {
    const body = decisionSchema.parse(req.body);
    const actor = actorFromRequest(req);
    await decideCase(req.params.id!, body.decision, body.rationale?.trim() || null, actor);
    res.json(await getCaseSummary(pool, req.params.id!));
  } catch (err) {
    if (err instanceof z.ZodError) return next(new HttpError(422, err.issues.map((i) => i.message).join('; ')));
    next(err);
  }
});

intakeRouter.post('/cases/:id/reopen', requireDepartment('compliance'), async (req, res, next) => {
  try {
    const actor = actorFromRequest(req);
    await reopenCase(req.params.id!, actor);
    res.json(await getCaseSummary(pool, req.params.id!));
  } catch (err) {
    next(err);
  }
});

intakeRouter.post('/documents', requireDepartment('finance'), upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) throw new HttpError(422, 'No file attached');
    const actor = actorFromRequest(req);
    const sha256 = createHash('sha256').update(req.file.buffer).digest('hex');
    const doc = await withTransaction((client) =>
      insertDocument(client, {
        filename: req.file!.originalname,
        byteSize: req.file!.size,
        sha256,
        uploadedBy: actor.id,
      })
    );
    res.status(201).json({ id: doc.id, filename: doc.filename, byteSize: doc.byte_size, sha256: doc.sha256 });
  } catch (err) {
    next(err);
  }
});

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

intakeRouter.get('/export/register.xls', async (_req, res, next) => {
  try {
    const cases = await listCaseSummaries(pool);
    const head = [
      'Ref', 'Classification', 'Counterparty', 'Basis of relationship', 'Transaction date',
      'Consideration (RM m)', 'Highest ratio', 'Aggregated 12 mth', 'Gate', 'Decision', 'Rule set', 'Financial basis',
    ];
    const rows = cases.map((c) => [
      c.ref,
      c.kindLabel,
      c.party.name,
      c.party.relationLabel,
      c.transactionDate ?? 'not stated',
      c.considerationMyr.toFixed(1),
      c.evaluation?.topPct !== null && c.evaluation?.topPct !== undefined ? `${c.evaluation.topPct.toFixed(2)}%` : 'not computed',
      c.evaluation?.aggregatePct !== null && c.evaluation?.aggregatePct !== undefined ? `${c.evaluation.aggregatePct.toFixed(2)}%` : '—',
      c.evaluation?.gate.title ?? 'Awaiting inputs',
      c.decision ? c.decision.label : 'Open',
      c.ruleSetVersion,
      c.financialBasis.label ? `${c.financialBasis.label} · ${c.financialBasis.status}` : 'none on file',
    ]);
    const tr = (cells: string[], tag: 'th' | 'td') =>
      `<tr>${cells.map((cell) => `<${tag}>${esc(cell)}</${tag}>`).join('')}</tr>`;
    const html =
      `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8">` +
      `<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>RPT Register</x:Name>` +
      `<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->` +
      `<style>td,th{font-family:Calibri,sans-serif;font-size:11pt;border:.5pt solid #bfbfbf;padding:3pt 5pt;vertical-align:top}th{background:#1d2d3d;color:#fff;font-weight:600}</style></head>` +
      `<body><table>${tr(head, 'th')}${rows.map((r) => tr(r, 'td')).join('')}</table></body></html>`;

    res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="rpt-register-${new Date().toISOString().slice(0, 10)}.xls"`);
    res.send('﻿' + html);
  } catch (err) {
    next(err);
  }
});
