# EAL `aspic-view/2` browser check

These are Cloud Browser captures of the production build served locally and a fresh EAL export from the architecture extension v1 fixture. The historical v1 capture in EAL PR #34 remains untouched.

Generate the view from the EAL repository after installing its dev dependencies:

```sh
python experiments/architecture_extension/run_eal.py --output-dir /tmp/aspic-v2-preview
```

Import `/tmp/aspic-v2-preview/aspic-view.json` into this visualiser, choose **Relations**, and select **undercut A23 to A21 at subargument A21**. The first capture shows the exact attacked subargument. Scroll the inspector to see the second capture: both `control_dispatch_fail` and `treated_dispatch_failure` appear as **Predicate not met**. Their collected values have `passed == true`; the declared failure evidence requires `passed == false`. Both records were compared successfully but supply no premise for a dispatch-failure claim.

The captured export SHA-256 was `ee276a8f7330e4b70454418e68fcf7d31a654a4d070a67c492d7b35ee9a405b7`. The two JPEG SHA-256 digests are `9fef36f32b7d570e5b77973d009f4736a29d521d85dd58cb37651f902e20e51d` and `20bb3881755cd3cf6e7a6b688c040adc9bc0480fada6e1ee886b97253e2f1275`, respectively. The interface verifies the import schema and supplied graph relations but does not recollect or authenticate those observations.

## Synthetic refund release gate

[The exact undercut](synthetic-release-undercut.jpg) and [the typed predicate panel](synthetic-release-predicate.jpg) show a **synthetic apparatus case** from EAL's `experiments/architecture_extension_v3/release_gate`. The selected case is `applied_unreconciled`. A direct `ReasoningService` collection and `compile_aspic(..., goal="candidate_completion")` call produced an `aspic-view/2` export. The graph has 11 arguments, one undercut (`A10 → A9` at `A9`) and a rejected provisional `candidate_completion` goal. The case also contains six successful observations whose declared predicates did not hold. This image establishes the displayed behaviour of this finite fixture, not a live refund outcome or an agent-performance difference.

The imported JSON SHA-256 was `6f555dfe0a7c4591d4b5a1d0a465264b9931ab2d2fd6efc9a18e336c54c46a32`. The respective JPEG SHA-256 digests are `25c531e9e9efc14b3cc6b69a5f89c73bfeb87216d93b1873c752cddaced6bfa8` and `d25681c4ed66a326cd6b8ebb1b9967edacb3db87c52d9d3e90e6c0455aeaa239`. They were captured through Cloud Browser from the same local production build as the earlier screenshots.
