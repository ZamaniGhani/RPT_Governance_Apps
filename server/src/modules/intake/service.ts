import { withTransaction } from '../../db.js';
import { appendEvent } from '../audit/index.js';
import { basisCodeForLabel, confirmRelation, createParty, createRelation, findActiveRelation, findPartyByName } from '../registry/index.js';
import { computeRatios, createEvaluation, createFinancialPeriod, gateFor, getCurrentRuleSet, getEvaluationForCase, priorConsiderationTotal, topRatio } from '../materiality/index.js';
import { insertApprovalStep, latestApprovalStep } from '../workflow/index.js';
import { getCase, getDocument, insertCase, nextCaseRef, setCaseStatus, setPendingApprover } from './repository.js';
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

/**
 * Two controls the Alerts UI previously only claimed to have:
 *
 * 1. A conflict attestation — every decision (approve, reject, or refer)
 *    requires the deciding user to actively confirm they are not a related
 *    party to the transaction and have no interest in it. Interested-party
 *    abstention applies to the whole deliberation, not only a "yes" vote.
 * 2. Maker-checker at the circular gate — a case that needs shareholder
 *    approval isn't finalised on one person's click. The first approval is
 *    held on the case as "pending", and a second, different Compliance or
 *    Admin account must approve it before status flips to 'decided'. Reject
 *    and refer stay single-sign-off, since either one halts the transaction
 *    rather than letting it proceed.
 */
export async function decideCase(
  caseId: string,
  decision: 'approve' | 'reject' | 'refer',
  rationale: string | null,
  actor: Actor,
  conflictConfirmed: boolean
) {
  return withTransaction(async (client) => {
    if (!conflictConfirmed) {
      throw new HttpError(422, 'You must confirm you are not a related party to this transaction and have no interest in it before deciding it.');
    }

    const kase = await getCase(client, caseId);
    if (!kase) throw new HttpError(404, 'Case not found');
    const evaluation = await getEvaluationForCase(client, caseId);
    const gateKey = evaluation?.gate ?? 'none';
    const approveLabel = APPROVE_LABEL_BY_GATE[gateKey]!;

    if (decision === 'approve' && gateKey === 'circular') {
      if (kase.pending_approver_id === actor.id) {
        throw new HttpError(
          409,
          'You already recorded the first approval on this case. A different Compliance or Admin account must provide the second sign-off — that is the control, not a formality.'
        );
      }
      if (!kase.pending_approver_id) {
        const label = 'First approval recorded — awaiting a second, different Compliance sign-off before this counts as approved';
        const step = await insertApprovalStep(client, {
          caseId,
          role: actor.role,
          actorId: actorLabel(actor),
          decision: label,
          decisionKey: 'approve',
          rationale,
          conflictConfirmed,
        });
        await setPendingApprover(client, caseId, { id: actor.id, label: actorLabel(actor), at: new Date().toISOString() });
        await appendEvent(client, {
          aggregateType: 'rpt_case',
          aggregateId: caseId,
          type: 'FirstApprovalRecorded',
          actorId: actorLabel(actor),
          detail: `${label}${rationale ? ` — ${rationale}` : ''}.`,
          payload: { rationale },
        });
        return step;
      }

      const label = `${approveLabel} — recorded (dual sign-off: ${kase.pending_approver_label}, then ${actorLabel(actor)})`;
      const step = await insertApprovalStep(client, {
        caseId,
        role: actor.role,
        actorId: actorLabel(actor),
        decision: label,
        decisionKey: 'approve',
        rationale,
        conflictConfirmed,
      });
      await setCaseStatus(client, caseId, 'decided');
      await setPendingApprover(client, caseId, null);
      await appendEvent(client, {
        aggregateType: 'rpt_case',
        aggregateId: caseId,
        type: 'DecisionRecorded',
        actorId: actorLabel(actor),
        detail: `${label}${rationale ? ` — ${rationale}` : ''}.`,
        payload: { decision: label, rationale },
      });
      return step;
    }

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
      decisionKey: decision,
      rationale,
      conflictConfirmed,
    });

    await setCaseStatus(client, caseId, 'decided');
    await setPendingApprover(client, caseId, null);

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
    await setPendingApprover(client, caseId, null);
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
