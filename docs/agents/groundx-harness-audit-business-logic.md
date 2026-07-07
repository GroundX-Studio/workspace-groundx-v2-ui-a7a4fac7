# Harness audit — extraction business-logic attrs are under-documented

**To:** the agent that maintains the `groundx-studio-harness` /
`groundx-extraction-workflows` skill.
**From:** groundx-v2-ui build agent, 2026-07-05.
**Scope:** compared `groundx-extraction-workflows/references/12_business_logic.md`
(and §2_schema_design) against the real implementation in
`eyelevelai/internal-arcadia-agents` (`prompts/current/latest.yaml`,
`docs/arcadia-yaml-relationship-algorithm.md`, `docs/arcadia-yaml-classes/*`,
`classes/{statement,meter,charge,extraction_reassembly}.py`).

The harness's business-logic model is a **simplified subset** of what production
(Arcadia) actually does, and in one place it is **misleading**. An agent building
a UI or a consumer against the harness docs would produce the wrong output shape.

## Finding 1 — `match_attrs` is described as "link", but it NESTS + routes

Harness §12 says:
> `match_attrs` — Cross-group foreign key linking this (child) group's records to
> a parent group's record… `link(child, parent, match_attrs)` — annotate each
> child with its matched parent under `_parent`.

And `apply_business_logic` runs **conflicts → dedup → passthrough** — no nesting,
no placement.

Reality (Arcadia `docs/arcadia-yaml-relationship-algorithm.md` → Charge-To-Meter
Matching; `Statement.get_charge_meter()` / `merge_charges_in_dom()`;
`charge.md`/`statement.md`):
- `charges.match_attrs` matches each charge to a meter. **All** configured
  match attrs must match one meter.
- A matched charge is **moved under that meter** (nested), producing
  `meters[].meter_charges`.
- A charge that matches no meter **stays as a top-level `account_charges`
  record**.

So `match_attrs` determines **placement** (nested meter charge vs. top-level
account charge) and **restructures** the output into a nested tree. It is not a
`_parent` annotation on a flat list. The harness's own `business_logic.py`
`link()` primitive does something materially different from the real system.

**Fix:** update §12 to state that `match_attrs` drives charge→parent matching AND
nesting/placement (matched → nested under parent; unmatched → a top-level bucket),
and show the nested output example below — not the flat `_parent` example.

## Finding 2 — the documented attr vocabulary is incomplete (4 of ~18)

§12 documents only `unique_attrs`, `match_attrs`, `conflict_attrs`, `passthrough`.
`latest.yaml` + `prompts/extraction_policy.py` register and consume many more, each
with distinct final-output behavior:

- **statement:** `final_value_aliases` (rename final keys), `fill_rules` (copy a
  value into another group on a condition).
- **meters:** `required_attrs`, `not_required_service_types`, `passthrough_attrs`,
  `passthrough_pair_attrs`, `partial_pair_attrs`, `equivalent_service_types`,
  `remaining_attrs`, `deregulation_status_values`, `explanation_attrs`,
  `always_check_attrs`, `exclude_dict_attrs`.
- **charges:** `required_any_attrs`, `always_check_attrs`, `exclude_dict_attrs`,
  `explanation_attrs` (in addition to match/unique/conflict).

Several of these change the **final JSON** an agent must render or reason about:
`final_value_aliases` renames keys; `explanation_attrs` render as arrays-with-
conflicts; `conflict_attrs` add `<field>__conflicts`; `passthrough_attrs` +
`add_passthrough_meter()` can **synthesize meter records** (e.g. a sewer meter
cloned from a parent water meter); `fill_rules` inject values into child groups.
An agent that only knows the 4 documented keys will mis-model the output.

**Fix:** add a full attr table (group · attr · effect on final output · consuming
method), mirroring `docs/arcadia-yaml-classes/{statement,meter,charge}.md`, and
mark which attrs are reference-only vs. which the real pipeline uses.

## Finding 3 — "final shape ≠ workflow shape" is stated but not shown concretely

§2/§12 correctly say the final groups differ from workflow execution, but the
example output (`{"statement": {...}, "charges": [...], "meters": [...]}`) is the
**pre-reassembly** flat shape. The **customer-facing** shape after Arcadia
reassembly is nested:

```
{
  ...statement scalar fields (root-level; final_value_aliases applied)...,
  "meters": [
    { ...meter fields, "<field>__conflicts": [...], ...,
      "meter_charges": [ ...charges whose match_attrs matched this meter... ] }
  ],
  "account_charges": [ ...charges that matched no meter... ]
}
```

**Fix:** show both — the raw flat platform `get_extract` groups AND the nested
customer JSON after `Statement.full_json()` — and state which one a consumer
receives (Arcadia ships the nested one).

## Net

The harness is a good on-ramp but presents a **lossy, partly-inaccurate** model of
extraction business logic. `internal-arcadia-agents/docs/arcadia-yaml-*` is the
accurate source. Recommend §12 either (a) point to that as canonical and scope
itself explicitly as "reference primitives, not the production reassembler," or
(b) be brought into alignment (match=nest+route, full attr table, nested output
example).
