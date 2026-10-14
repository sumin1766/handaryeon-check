<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Regional church statistics use a dedicated SELECT-only shared-password server function resolving the active season internally; this preserves existing storage, fee, and attendee calculations.
- Region display and list exports deduplicate linked submissions by church ID and choose a designated representative's valid address, otherwise the earliest valid confirmed address; this preserves shared classification without automatic name merging or data mutations.
- Both regional views consume the same query and pure aggregation module; this keeps map, subtotals, and exports consistent without introducing persisted aggregates.
- The pre-registration duplicate summary consumes the shared regional query, and intake-only manager deduplication is opt-in at rendering time; this preserves other tabs, source counts and representative actions.
- Embed simplified licensed province SVG paths locally and generate paginated PDF/PNG exports in browser event handlers; this avoids paid map services and server-only rendering dependencies.
- Regional list exports reuse confirmedRegionUnits with an on-demand SELECT-only password-authorized read, and intake/registry people-row counts; this keeps contact data out of the map query and totals consistent without persisted calculations.
- Dashboard and exported maps share path, label geometry and bin definitions; this prevents geographic and legend drift while browser Canvas supplies portable PDF/PNG output.
- MCP uses OAuth with client-claim verification and static reference-only tools; shared-password authorization does not establish OAuth row access, so private camp data remains outside MCP until an explicitly approved identity mapping exists.
- Browser tools mount inside the unlocked app shell and resolve targets from visible permitted navigation; this preserves role and season gates without introducing data mutations.
- Church-list export summaries derive only from unchanged grouped rows, with separate CSV and TSV serializers; this keeps presentation totals consistent and clipboard spreadsheet columns intact without altering server calculations.
