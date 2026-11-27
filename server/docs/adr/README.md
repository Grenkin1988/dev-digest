# server — architecture decision records

One file per decision: `NNNN-<slug>.md`, numbered in order. Add a row whenever you
add an ADR. A superseded ADR stays, with its status changed to `superseded by NNNN`.

| ADR | Status | Decision |
|-----|--------|----------|
| [0001-intent-layer-quarantine](0001-intent-layer-quarantine.md) | accepted | Intent classifier is quarantined; confidence, scope filtering and fetch rules are decided in code, and serious findings are never dropped |
