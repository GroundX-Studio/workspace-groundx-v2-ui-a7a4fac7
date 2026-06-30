# Preloaded Content Scenarios

Use these scenarios in wireframes for the chat-driven onboarding and shared sandbox evaluation experience.

| Scenario | Source | Designer framing |
|---|---|---|
| Utility Bill | User-defined onboarding scenario | Best simple-looking but messy first-run example. |
| Loan Eligibility Packet | Matt Bailey mocks | Best structured extraction / downstream JSON example. |
| Solar Project Portfolio | Chris Turner mocks | Best enterprise / cross-document intelligence example. |

## 1. Utility Bill: Messy Charges Across 8 Meters

Use in wireframes: first onboarding bucket.

A three-page utility bill that looks ordinary at first glance, but contains a messy charge structure: 56 line-item charges spread across three pages and eight separate utility meters. Charges are grouped inconsistently, totals appear in multiple places, meter IDs repeat across pages, and some line items are visually close to the wrong meter.

| Element | Wireframe content |
|---|---|
| User asks | "Extract every charge by meter." "Which meter had the highest demand charge?" "Reconcile the total bill amount against all line items." "Show me where each charge came from." |
| GroundX shows | Extracted table by meter, charge type, amount, and source page. |
| Evidence moment | Citations for every extracted value; X-Ray/source view showing which line items belong to which meter. |
| Trust signal | Warning or confidence signal where the bill layout is ambiguous. |
| Why it works | Proves GroundX can handle dense, messy data even when the document is only a few pages. The problem is layout, grouping, and focus, not document length. |

## 2. Loan Eligibility Packet

Use in wireframes: structured extraction / parsed data scenario.

A loan eligibility packet with borrower income documents, pay stubs, W-2s, debt obligations, employment history, and supporting notes. The user wants to build an underwriting or eligibility workflow that turns the packet into machine-readable, cited structured data.

| Element | Wireframe content |
|---|---|
| User asks | "Extract annual income, debt-to-income ratio, employer, employment length, and flagged anomalies." "Create a JSON output for a loan approval workflow." "Identify gaps in employment or unexplained large deposits." "Show citations for every eligibility field." |
| GroundX shows | Parsed output preview in JSON/table form. |
| Field groups | Income, debt, employment stability, anomalies, missing documents. |
| Evidence moment | Citations on every extracted value. |
| Interaction pattern | User describes the downstream tool in chat; GroundX shapes the parsed output. |
| Why it works | Shows GroundX as workflow infrastructure, not just document chat. The user is configuring data for an application. |

## 3. Solar Project Portfolio

Use in wireframes: enterprise / cross-document evaluation scenario.

A solar asset or project finance document set organized across portfolio, fund, and project levels. It includes agreements, permits, utility documents, engineering studies, leases, vendor reports, financial assumptions, and project status documents.

| Element | Wireframe content |
|---|---|
| User asks | "Summarize risk across this project." "Which projects have the highest lease or interconnection exposure?" "What documents support the current NPV estimate?" "Compare project status across the portfolio." "Generate an investment committee brief with citations." |
| GroundX shows | Bucket/project hierarchy: Portfolio -> Fund -> Project. |
| Evidence moment | Cross-document chat with cited answers. |
| Product capabilities | Extracted fields from different document types; report generation for project summary, risk flags, missing docs, and financial highlights. |
| Enterprise depth | Intelligence layer or reusable domain rules for solar/project finance. |
| Why it works | Proves enterprise depth. The value is understanding a complex business context across many related documents and rolling it up into decisions. |
