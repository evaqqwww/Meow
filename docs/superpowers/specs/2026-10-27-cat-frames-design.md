# Cat sequence interaction

Replace the two-pose switch with the user's five original PNG frames. Retain the temple, text-entry flow and random blessings.

Hold for 1000 ms on frame 1, then move through frames 2/3/4/5 at 1500/2000/2500/3000 ms. The forward movement spans 2000 ms. At 3000 ms choose one blessing, show it for 1000 ms, and retain frame 5 while the user keeps holding. Releasing starts reverse playback from the current frame, one step per 500 ms; a complete reversal lasts 2000 ms. Do not finish the forward sequence after an early release.

An interrupted attempt produces no blessing; after reversing, return to the prepared state with the input retained. A completed attempt resets the input only after reverse playback and the blessing display end. A release before 1000 ms immediately returns to the prepared state. Pointer cancellation, leaving the target, keyboard blur and page hiding also reverse the displayed pose without awarding an unobserved delayed completion. Re-pressing or editing is blocked until reverse playback ends.

Use the existing clock-driven model with frameIndex and a returning phase. Keep the paw mounted and enabled through the completed held pose so pointer capture remains valid. Update images independently of phase changes. Preload all frames. Keep reply timing separate from pose timing so the one-second blessing does not force a held paw down.

Approach: use five image URLs and the existing animation-frame clock; a video or newly generated tween is unnecessary because the user supplied the exact sequence. Full reverse duration is the same 2 seconds as forward; partial reversal scales with the displayed frame. These are implementation choices consistent with the requested sequence.
