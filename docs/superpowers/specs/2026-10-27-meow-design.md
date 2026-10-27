# Meow mobile interaction

Build the user's specified four-image interaction as a Chinese mobile-first static web app, then upload it to the GitHub repository `Meow` and publish GitHub Pages.

The supplied temple is the background. Cat image 1 is the default. Tapping the cat opens a text-entry sheet and the phone keyboard. Confirming a nonempty message reveals the supplied pink paw beside the cat. An uninterrupted 3000 ms hold changes the cat to image 2 and displays a speech bubble for 1000 ms, then restores the default scene. Early release, pointer cancellation, leaving the target, or hiding the page resets hold progress. The interaction can be repeated.

Reply content (updated at the user's request): choose one random preset Chinese blessing after a successful hold, excluding a phrase exactly matching the submitted input. Keep that blessing stable throughout the 1000 ms reply and choose again for each completed interaction. All other interaction behavior stays unchanged. Input is limited to 120 UTF-16 code units, can be edited before holding, and cannot be blank; no server or persistence is needed. Use textContent for speech, native dialog semantics, Pointer Events and keyboard hold support. Provide progress and clear Chinese instructions, safe-area spacing, responsive layouts, and reduced-motion support. Preserve all four original PNGs without modification.

Approaches considered: a framework adds a build dependency without helping this small interaction; a buildless static app matches GitHub Pages and works without external services. Use static HTML/CSS/ES modules, a testable clock-driven state machine, Node's built-in test runner, and a small static build/preview script. Hosting is GitHub Pages as explicitly requested; Sites hosting is unnecessary.

Acceptance: correct assets, real text entry, exact state transitions, interrupted holds do not accumulate time, no stale double completion, readable long messages, phone and desktop layout, local tests and browser checks, then verified remote upload and Pages deployment when connectivity permits.
