export type PartyKind = 'person' | 'entity';
export type RelationBasisCode = 'spouse' | 'child' | 'director' | 'shareholder' | 'control' | 'associate';
export type RelationSource = 'declared' | 'detected' | 'manual';

export interface BasisOption {
  code: RelationBasisCode;
  label: string;
}

export const BASIS_OPTIONS: BasisOption[] = [
  { code: 'spouse', label: 'Spouse of a director' },
  { code: 'child', label: 'Child or parent of a director' },
  { code: 'director', label: 'Director in common' },
  { code: 'shareholder', label: 'Major shareholder — 5% or more' },
  { code: 'control', label: 'Controlled by a director or major shareholder' },
  { code: 'associate', label: 'Associate of the group' },
];

export function basisCodeForLabel(label: string): RelationBasisCode {
  return BASIS_OPTIONS.find((b) => b.label === label)?.code ?? 'associate';
}

export interface PartyRow {
  id: string;
  kind: PartyKind;
  legal_name: string;
  nric_or_reg_no: string | null;
  created_at: string;
}

export interface PartyRelationRow {
  id: string;
  from_party: string;
  to_party: string | null;
  basis: RelationBasisCode;
  basis_label: string;
  source: RelationSource;
  confidence: string | null;
  effective_from: string;
  effective_to: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
}
