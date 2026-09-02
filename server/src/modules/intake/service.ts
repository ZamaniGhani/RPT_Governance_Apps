import { withTransaction } from '../../db.js';
import { appendEvent } from '../audit/index.js';
import { basisCodeForLabel, confirmRelation, createParty, createRelation, findActiveRelation, findPartyByName } from '../registry/index.js';
import { computeRatios, createEvaluation, createFinancialPeriod, gateFor, getCurrentRuleSet, getEvaluationForCase, priorConsiderationTotal, topRatio } from '../materiality/index.js';
import { insertApprovalStep, latestApprovalStep } from '../workflow/index.js';
import { getDocument, insertCase, nextCaseRef, setCaseStatus } from './repository.js';
import { ROUTE_VERSION, type SubmitCaseInput } from './types.js';
import { HttpError } from '../../shared/httpError.js';
import type { Actor } from '../../shared/actor.js';
import { actorLabel } from '../../shared/actor.js';

export async function submitCase(input: SubmitCaseInput, actor: Actor) {
  return withTransaction(async (client) => {
    const ruleSet = await getCurrentRuleSet(client);

    let party = await findPartyByName(client, input.party);
    let relationId: string | null = null;
    let isNewParty = false;

    if (party) {
      const active = await findActiveRelation(client, party.id);
      relationId = active?.id ?? null;
    } else {
      isNewParty = true;
      if (!input.basisLabel) {
        throw new HttpError(422, 'Basis of relationship is required for a new counterparty');
      }
      party = await createParty(client, {
        kind: input.partyType === 'Person' ? 'person' : 'entity',
        legalName: input.party,
      });
      const relation = await createRelation(client, {
        fromParty: party.id,
        basis: basisCodeForLabel(input.basisLabel),
        basisLabel: input.basisLabel,
        source: 'declared',
      });
      relationId = relation.id;
    }

    const now = new Date();
    const ref = await nextCaseRef(client, now.getFullYear());

    const document = input.financialDocumentId ? await getDocument(client, input.financialDocumentId) : null;
    const hasFinancials =
      input.financials.netAssets !== null ||
      input.financials.totalAssets !== null ||
      input.financials.profitBeforeTax !== null ||
      input.financials.marketCap !== null;

    let financialPeriodId: string | null = null;
    if (hasFinancials) {
      const fp = await createFinancialPeriod(client, {
        label: document ? document.filename : 'keyed manually',
        netAssets: input.financials.netAssets,
        totalAssets: input.financials.totalAssets,
        marketCap: input.financials.marketCap,
        netProfit: input.financials.profitBeforeTax,
        sourceDocumentId: document?.id ?? null,
      });
      financialPeriodId = fp.id;
    }

    const ratios = computeRatios(input.considerationMyr, input.financials, ruleSet.thresholds);
    const top = topRatio(ratios);
    const gate = gateFor(top, ruleSet.thresholds);

    const priorTotal = await priorConsiderationTotal(client, party.id, now);
    const aggregateMyr = input.financials.netAssets ? priorTotal + input.considerationMyr : null;
    const aggregatePct = input.financials.netAssets && aggregateMyr !== null ? (aggregateMyr / input.financials.netAssets) * 100 : null;

    const kase = await insertCase(client, {
      ref,
      kind: input.kind,
      counterpartyPartyId: party.id,
      counterpartyRelationId: relationId,
      nature: input.nature,
      considerationMyr: input.considerationMyr,
      transactionDate: input.transactionDate,
      submittedBy: actorLabel(actor),
      ruleSetVersion: ruleSet.version,
      routeVersion: ROUTE_VERSION,
    });

    if (top !== null) {
      await createEvaluation(client, {
        caseId: kase.id,
        ruleSetVersion: ruleSet.version,
        financialPeriodId,
        ratios,
        topPct: top,
        aggregateMyr,
        aggregatePct,
        gate,
      });
    }

    await appendEvent(client, {
      aggregateType: 'rpt_case',
      aggregateId: kase.id,
      type: 'TransactionSubmitted',
      actorId: actorLabel(actor),
      detail: `${ref} created. ${input.nature}, consideration RM ${input.considerationMyr.toFixed(1)}m${
        input.transactionDate ? `, transaction date ${input.transactionDate}` : ''
      }.`,
      payload: { ref, kind: input.kind, nature: input.nature, considerationMyr: input.considerationMyr },
    });

    if (!isNewParty) {
      await appendEvent(client, {
        aggregateType: 'rpt_case',
        aggregateId: kase.id,
        type: 'CounterpartyScreened',
        actorId: 'system',
        detail: `Matched register party ${party.legal_name}.`,
        payload: { partyId: party.id },
      });
    } else {
      await appendEvent(client, {
        aggregateType: 'rpt_case',
        aggregateId: kase.id,
        type: 'PartyRelationProposed',
        actorId: 'system',
        detail: `New party proposed: ${party.legal_name} (${input.partyType}), basis: ${input.basisLabel}. Unconfirmed until the secretariat accepts it.`,
        payload: { partyId: party.id, relationId },
      });
    }

    if (top === null) {
      await appendEvent(client, {
        aggregateType: 'rpt_case',
        aggregateId: kase.id,
        type: 'MaterialityDeferred',
        actorId: 'system',
        detail: 'No usable financial basis. Evaluation deferred; the case cannot pass secretariat review until a financial period is supplied.',
        payload: {},
      });
    } else {
      await appendEvent(client, {
        aggregateType: 'rpt_case',
        aggregateId: kase.id,
        type: 'MaterialityEvaluated',
        actorId: 'system',
        detail: `Rule set ${ruleSet.version}. Highest ratio ${top.toFixed(2)}% → ${gate.title}.`,
        payload: { topPct: top, gate: gate.key },
      });
    }

    if (priorTotal > 0 && aggregatePct !== null) {
      await appendEvent(client, {
        aggregateType: 'rpt_case',
        aggregateId: kase.id,
        type: 'AggregationRecomputed',
        actorId: 'system',
        detail: `Rolling twelve-month total with this party: RM ${(priorTotal + input.considerationMyr).toFixed(1)}m = ${aggregatePct.toFixed(2)}% of net assets.`,
        payload: { aggregateMyr, aggregatePct },
      });
    }

    return { caseId: kase.id, ref, isNewParty, partyName: party.legal_name, gate, topPct: top };
  });
}

const APPROVE_LABEL_BY_GATE: Record<string, string> = {
  circular: 'Escalate to circular',
  announce: 'Approve for announcement',
  record: 'Record as reviewed',
  none: 'Record as reviewed',
};

export async function decideCase(caseId: string, decision: 'approve' | 'reject' | 'refer', rationale: string | null, actor: Actor) {
  return withTransaction(async (client) => {
    const evaluation = await getEvaluationForCase(client, caseId);
    const approveLabel = APPROVE_LABEL_BY_GATE[evaluation?.gate ?? 'none']!;
    const labels = {
      approve: `${approveLabel} — recorded`,
      reject: 'Rejected — returned to submitter',
      refer: 'Returned for further information',
    };
    const label = labels[decision];

    const step = await insertApprovalStep(client, {
      caseId,
      role: actor.role,
      actorId: actorLabel(actor),
      decision: label,
      rationale,
    });

    await setCaseStatus(client, caseId, 'decided');

    await appendEvent(client, {
      aggregateType: 'rpt_case',
      aggregateId: caseId,
      type: 'DecisionRecorded',
      actorId: actorLabel(actor),
      detail: `${label}${rationale ? ` — ${rationale}` : ''}.`,
      payload: { decision: label, rationale },
    });

    return step;
  });
}

export async function reopenCase(caseId: string, actor: Actor) {
  return withTransaction(async (client) => {
    await setCaseStatus(client, caseId, 'open');
    await appendEvent(client, {
      aggregateType: 'rpt_case',
      aggregateId: caseId,
      type: 'CaseReopened',
      actorId: actorLabel(actor),
      detail: 'Case reopened for further review.',
      payload: {},
    });
  });
}

export { latestApprovalStep };
