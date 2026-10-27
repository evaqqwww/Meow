# Cat sequence interaction

Replace the two-pose switch with the user's five original PNG frames. Retain the temple, text-entry flow and random blessings.

Hold for 300 ms on frame 1, then move through frames 2/3/4/5 at 500/700/900/1100 ms. The forward movement spans 800 ms, with one step every 200 ms. At 1100 ms choose one blessing, show it for 1000 ms, and retain frame 5 while the user keeps holding. Releasing starts reverse playback from the current frame, one step per 200 ms; a complete reversal lasts 800 ms. Do not finish the forward sequence after an early release.

An interrupted attempt produces no blessing; after reversing, return to the prepared state with the input retained. A completed attempt resets the input only after reverse playback and the blessing display end. If the 800 ms reverse finishes before the 1000 ms blessing display, hold the first frame until the speech period ends. A release before the first frame change at 500 ms immediately returns to the prepared state. Pointer cancellation, leaving the target, keyboard blur and page hiding also reverse the displayed pose without awarding an unobserved delayed completion. Re-pressing or editing is blocked until reverse playback and any active blessing display both end.

Use the existing clock-driven model with frameIndex and a returning phase. Keep the paw mounted and enabled through the completed held pose so pointer capture remains valid. Update images independently of phase changes. Preload all frames. Keep reply timing separate from pose timing so the one-second blessing does not force a held paw down.

Approach: use five image URLs and the existing animation-frame clock; a video or newly generated tween is unnecessary because the user supplied the exact sequence. Full reverse duration is the same 0.8 seconds as forward; partial reversal scales with the displayed frame. These are implementation choices consistent with the requested sequence.
