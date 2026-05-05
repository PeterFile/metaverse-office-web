# RimWorld-style information UI reference

Purpose: keep `metaverse-office-web` world-first. Do not make the Hub a dumping-ground sidebar. Use compact inspect surfaces, explicit drilldown, and thin readable chrome.

## Collected reference facts

- RimWorld Wiki search result for `User interface` describes an `Inspect pane` that appears when the player selects a pawn, item, or structure and shows details about that object. URL: https://rimworldwiki.com/wiki/User_interface
- RimWorld Wiki / tutorial search results describe right-edge alerts as the attention surface for issues that need player attention. URLs: https://rimworldwiki.com/wiki/User_interface and https://rimworld.fandom.com/wiki/Tutorial
- RimHUD README says it adds detailed information for a selected character/creature, integrates that HUD into the inspect pane, can resize the inspect pane, or can show the HUD as a separate floating window docked to any screen position. It also uses visual warnings for critical pawn conditions. URL: https://github.com/Jaxe-Dev/RimHUD
- Steam Workshop search snippets for RimHUD and UI tweaks confirm the same pattern: selected-character details live in/near the inspect pane, not as the only right-side navigation column. URLs: https://steamcommunity.com/sharedfiles/filedetails/?id=1508850027 and https://steamcommunity.com/sharedfiles/filedetails/?id=1832474087

Cloudflare blocked direct extraction of rimworldwiki.com in this environment; treat the wiki facts above as search-result evidence, not a full-page extraction.

## Design translation for Metaverse Office

1. World click selects first, does not force-open the Hub.
   - Default selection should show a compact inspect popover over the world.
   - Deep timeline/evidence/replay remains explicit via `Open selected agent in Hub`.

2. Hub is drilldown, not the default answer to every click.
   - The Hub still owns long evidence, replay, memory, and correlation panels.
   - Attention/evidence chips may intentionally open the Hub when their job is a deep evidence route.

3. Keep alerts/attention compact and edge-aligned.
   - Use hot-zone/status/evidence strips as bounded overlays.
   - Do not expand them into large stacked cards that block the drag lane.

4. Use thin operator chrome.
   - Preserve existing 9-slice assets but reduce CSS border thickness.
   - Avoid thick nested frames around every stat/card/summary.

5. Prefer one floating inspect window over another sidebar.
   - Selected-agent peek should read as a dockable/floating inspect pane.
   - It must stay bounded, internally scroll long tokens, and avoid the primary world drag lane.

## Acceptance for this slice

- World/living-agent selection shows `Selected agent inspect peek` and keeps `Hub` closed.
- Evidence coverage focus can still intentionally open Hub Evidence drilldown.
- Borders use thinner CSS variables and no large `clamp(24px, 5vw, 46px)` summary frame.
- Real browser smoke proves the inspect popover is visible, bounded, and does not block primary drag.
