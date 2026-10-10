# Using TabSort

## Prepare and organise tabs

1. Open several YouTube watch or Shorts pages in one Chrome window.
2. Open TabSort to see their remaining times. Ready video rows are highlighted.
3. Choose **Auto-prepare tabs** to read times for eligible videos in a separate window while you keep browsing.
4. Choose **Organise tabs** or **Organise ready tabs** to arrange the available videos by remaining time.

Auto-prepare handles one video at a time. A temporary placeholder preserves its
position and Chrome tab group; the original video returns without changing your
selected tab. Ready, pinned, live, and currently selected tabs are skipped. TabSort
does not click Play, so videos that still need interaction may be skipped.

The optional **Open TikTok picture-in-picture during auto-prepare** setting asks
the locally installed TikTok Picture-in-Picture extension to reuse or create a
TikTok tab and start automatic PiP. Preparation still starts if TikTok or playable
media is unavailable.

## Read the popup

The **Remaining** column shows a time or explains why one is unavailable:
**Sleeping**, **Loading tab**, **Loading video**, **Needs viewing**, or
**Couldn’t read time**. Follow the **View tab** or **Reload tab** action when shown.
Viewing a background tab once can let Chrome expose an accurate remaining time.

A successfully prepared sleeping tab returns to sleep and shows
**Auto-prepared · sleeping** beside its recorded time. Awake readings and live
status refresh while the popup is open, periodically in the background, and before
organising. Sleeping prepared readings stay cached.

The organise button appears when at least two eligible videos have known times
and the YouTube layout still needs arranging. **Ready tabs already in order**
means the ready subset is ordered; other YouTube pages may still need arranging.
**YouTube tabs organised** means the complete layout is organised, and hides the
organise button and site-grouping option.

## Sorting and Chrome groups

YouTube tabs move to the front of the unpinned tab strip, with tracked videos first.
Enable **Keep other tabs from the same site together** to also group other pages
by site.

Existing Chrome tab groups stay together and retain their names, colours, and
collapsed state. A group is placed by its first video in the requested order, and
its videos are sorted within the group. Mixed groups keep their other pages with
their videos, so the global time order can differ across groups.

## Stop or close preparation

Preparation continues when the toolbar popup closes. The preparation window has
a progress tab with counts and a **Stop** button. Successful completion closes
that progress tab; Chrome closes the window if it is then empty. A stopped run
keeps the progress tab so you can read its status.

**Stop auto-prepare** in the popup, **Stop** in the progress page, and **Stop and
return video** in the placeholder return the current video before ending the run.
Switching tabs in your browsing window does not stop preparation. Selecting a
different tab inside the preparation window stops it and returns the video.

Use Stop before closing the preparation window. Closing the window also closes
its current video; the placeholder can reopen the original URL, but cannot
restore that page’s state.

## Session recovery

Prepared times survive window changes and extension-worker suspension within the
browser session. Awake saved times are used only when newer playback data is
unavailable. Waking, reloading, navigating, or closing a tab invalidates its saved
result. Restarting Chrome clears the session cache.

After an interrupted worker restarts, TabSort uses its session journal to return
an outstanding video. If its original window was closed, the video remains safely
in the preparation window.
