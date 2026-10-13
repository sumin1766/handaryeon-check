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
- Region display deduplicates linked submissions by church ID and chooses a designated representative's address, otherwise the earliest valid address; unlinked submissions and legacy churches remain visible without automatic name merging.
- Both regional views consume the same query and pure aggregation module; this keeps map, subtotals, and exports consistent without introducing persisted aggregates.
- Embed simplified licensed province SVG paths locally and generate paginated PDF/PNG exports in browser event handlers; this avoids paid map services and server-only rendering dependencies.
