# Cat sequence implementation plan

**Goal:** Replace cat poses with the supplied five-frame forward/reverse sequence and publish the updated Pages app.

**Spec:** docs/superpowers/specs/2026-10-27-cat-frames-design.md

- Test the 1000 ms delay, four 500 ms forward steps, full and partial reverse playback, held pose after reply expiry, release at the completion boundary, interrupted/background holds, repeated interactions and blessing stability.
- Extend site/interaction.js with frameIndex and returning state; separate input/reply timing from animation completion.
- Update site/app.js on frame changes and keep the captured paw present until release; schedule reverse frames and handle cancellation.
- Copy original PNGs, preload them in site/index.html, and synchronize README/current design requirements.
- Run all tests and build, obtain independent review, verify forward/reverse UI, commit/push and verify Pages and live resources.

Validation: 17 tests pass and the build contains 14 public files. Independent review found no material issues. A 390x844 browser test observed frames 2/3/4/5 in order during a 4400 ms hold, frame 5 still held after the blessing expired, then frames 4/3/2/1 after release and an idle reset. A 2200 ms hold reversed from frame 3 through 2 to 1 without a blessing, returned to ready, and retained the submitted text.
