# Recorded match review — 5 September 2026

Read-only database audit, all available dates. Paginated both tables to exhaustion. Times below are Bangkok (UTC+7).

## Coverage and limits

- 65 actual match-result rows, plus 76 claim records (claims are not extra games).
- 32 replays: 19 player games and 13 explicitly Codex test recordings.
- 33 match results have no stored action replay; their tactics cannot be reconstructed from results alone.
- All 32 replay payloads were scanned: 6,208 actions, including 5,655 actions in player games.
- Player replays contain 5,161 human decisions with semantic context and multiple untruncated legal candidates before outcome/trajectory filtering. The existing extractor emits 5161 samples. Saved separately for further analysis; these are evidence candidates, not validated optimal moves.
- 14 player replays declare adventure-start; four declare mid-match-recovery; one legacy replay omits captureStart and terminal winner. None is marked truncated.
- 9 player replays have adjacent state-hash discontinuities. These require explanation before deterministic playback/training; a hash discontinuity alone does not prove an illegal move or cheating.
- This is an event/context audit, not engine-version-matched deterministic re-execution or counterfactual evaluation of every move.

## Absolution vs HanzoVie

The database name is HanzoVie. Today's three head-to-head games:

| Finished (Bangkok) | Actions | Rounds | Result | Capture finding |
|---|---:|---|---|---|
| 5 Sep 14:56 | 575 | 1–7 | HanzoVie win; Absolution gave up | No hash gaps; no PvP combat recorded |
| 5 Sep 15:17 | 14 | 1–2 | Absolution win; HanzoVie abandoned | Too short to infer strategic superiority |
| 5 Sep 16:47 | 457 | 1–7 | HanzoVie win; Absolution gave up after PvP defeat | Four hash gaps |

Earlier long game (bti4so): Absolution won four neutral battles but retreated three times (rounds 4, 6, 7). HanzoVie won six neutral battles and retreated once (round 3). HanzoVie recovered from that setback and continued clearing. No PvP fight occurred. At sequences 571–574, HanzoVie played Torso of Legion for two building materials, used Mystic Orb of Mana to search the discard pile, then played Torso of Legion again for one valuable. This is a concrete resource-reuse pattern worth testing in the computer policy. The observed sequence supports card reuse; it does not establish that every available alternative was worse.

Later game (5fcaqr): Absolution won four neutral fights, then retreated from neutrals in round 6 (sequence 354). HanzoVie won six neutral fights, defeated/surrendered Absolution's secondary encounter at sequence 390, and won the main PvP fight at sequence 454 in round 7. At the post-battle acknowledgement the recorded context has HanzoVie with five living units / 26 health and Absolution with zero. Absolution gave up at sequence 457. At the last attack HanzoVie combined Bloodlust with Magic Arrow used as a Power boost, then Knowledge; Absolution's expert Resistance cancelled Bloodlust, but the unboosted resolved attack still dealt the lethal two damage. Knowledge/Mysticism returned Bloodlust to hand. This suggests evaluating whether a defensive response actually prevents lethal damage, rather than valuing cancellation alone. It does not prove Resistance was a mistake without the full alternative and future-value analysis.

The four discontinuities in the later replay precede sequences 108, 298, 395 and 435. Two follow JOIN_ROOM, two occur between combat actions. Preserve the observed events, but do not call this a verified continuous simulation.

## Lessons supported across the available records

1. Recovery matters more than a blanket 'never retreat' rule. HanzoVie won the earlier game after a round-3 retreat; Dra beat theBigMike after a round-1 retreat; Absolution won the September 2 three-player game despite early neutral setbacks. These examples refute labeling every losing battle as a losing overall strategy. They do not show retreat itself causes a win.
2. Neutral combat risk and repeated failed clears deserve explicit evaluation. The two longer HanzoVie wins show continued successful clearing while Absolution suffered later retreats. Compare expected losses, resource rewards and recovery costs before teaching more aggression.
3. Distinguish battle outcomes, match outcomes and abandonment. A short abandonment is weak tactical evidence; a losing match can contain good fights, and a winning match can contain poor fights.
4. Resource cards and discard recovery can create useful action sequences. Preserve action parameters/card identities, not merely PLAY_CARD frequency.
5. Keep old partial captures for local tactical analysis, never opening-policy evidence. Keep the 13 test recordings out of human strategy statistics.

## Learning pipeline findings

The repository has an extractor and aggregator, but searching non-test source found no caller outside the learning module. Recording a replay does not presently demonstrate that the live computer policy updates itself. This review saved decision samples and findings; it did not train or deploy a policy.

Code inspection also found two reasons not to promote aggregate preferences blindly: (a) conflicting win/loss votes from one match are deleted, but a later repeated sample can re-add that match, making its vote depend on action order; (b) battle attribution uses contiguous combat-domain segments instead of combatContextId, while the later HanzoVie replay includes distinct neutral combat IDs ending in interleaved order. Battle-level labels need context-aware validation. These are review findings, not fixes performed in this task.

## Every stored replay

| Finished (Bangkok) | Players and result | Actions | Rounds | Capture | Hash gaps |
|---|---|---:|---|---|---:|
| 05/09/2026, 16:47:05 | Absolution: loss; HanzoVie: win | 457 | 1–7 | adventure-start | 4 |
| 05/09/2026, 15:17:01 | Absolution: win; HanzoVie: abandon | 14 | 1–2 | adventure-start | 0 |
| 05/09/2026, 14:56:27 | Absolution: loss; HanzoVie: win | 575 | 1–7 | adventure-start | 0 |
| 04/09/2026, 18:58:21 | theBigMike: loss; Dra: win | 253 | 1–8 | adventure-start | 0 |
| 03/09/2026, 23:16:44 | Absolution: win; REAPER: loss | 915 | 1–12 | adventure-start | 1 |
| 03/09/2026, 21:47:06 | HanzoVie: win; Dra: loss | 100 | 1–2 | adventure-start | 0 |
| 03/09/2026, 21:08:35 | Dra: abandon; HanzoVie: win | 239 | 1–5 | adventure-start | 1 |
| 03/09/2026, 13:02:31 | Dra: abandon; HanzoVie: win | 37 | 1–1 | adventure-start | 2 |
| 03/09/2026, 00:17:38 | Absolution: win; REAPER: loss | 1024 | 1–13 | adventure-start | 2 |
| 02/09/2026, 23:10:31 | Dra: loss; HanzoVie: win | 153 | 1–3 | adventure-start | 0 |
| 02/09/2026, 22:29:26 | Absolution: abandon; Dra: win; HanzoVie: loss | 162 | 1–3 | adventure-start | 4 |
| 02/09/2026, 20:28:19 | Absolution: loss; REAPER: win | 911 | 1–15 | adventure-start | 1 |
| 02/09/2026, 18:17:11 | Absolution: win; HanzoVie: loss; Dra: loss | 453 | 1–6 | adventure-start | 1 |
| 02/09/2026, 14:40:57 | Absolution: loss; REAPER: win | 121 | 1–3 | adventure-start | 0 |
| 01/09/2026, 10:51:54 | ProofA1788188791: loss; ProofB1788188791: win | 230 | 1–2 | adventure-start (test) | 0 |
| 01/09/2026, 03:44:24 | ProofA1788188791: win; ProofB1788188791: loss | 236 | 1–2 | adventure-start (test) | 0 |
| 01/09/2026, 02:30:32 | ProofA1788188791: win; ProofB1788188791: loss | 2 | 3–3 | mid-match-recovery (test) | 0 |
| 01/09/2026, 01:56:35 | ProofA1788188791: loss; ProofB1788188791: win | 2 | 4–4 | mid-match-recovery (test) | 0 |
| 01/09/2026, 01:35:38 | ProofA1788188791: win; ProofB1788188791: loss | 2 | 10–10 | mid-match-recovery (test) | 0 |
| 01/09/2026, 00:40:12 | ProofA1788188791: win; ProofB1788188791: loss | 3 | 3–3 | adventure-start (test) | 0 |
| 31/08/2026, 19:17:17 | R1BattleA8170184: win; R1BattleB8170184: loss | 1 | 35–35 | adventure-start (test) | 0 |
| 31/08/2026, 16:44:43 | R1ProofA8160618: loss; R1ProofB8160618: win | 33 | 1–1 | adventure-start (test) | 0 |
| 31/08/2026, 16:43:33 | R1ProofA8160618: win; R1ProofB8160618: loss | 14 | 1–6 | adventure-start (test) | 0 |
| 31/08/2026, 16:37:58 | R1ProofA8160618: win; R1ProofB8160618: loss | 10 | 1–4 | adventure-start (test) | 0 |
| 31/08/2026, 15:15:01 | Absolution: win; REAPER: loss | 30 | 8–8 | mid-match-recovery | 0 |
| 31/08/2026, 14:46:14 | R1LiveA8160074: win; R1LiveB8160074: loss | 4 | 1–1 | adventure-start (test) | 0 |
| 31/08/2026, 14:41:12 | R1ProofA8160618: win; R1ProofB8160618: loss | 12 | 1–4 | adventure-start (test) | 0 |
| 31/08/2026, 14:33:47 | R1ProofA8160618: win; R1ProofB8160618: loss | 4 | 1–1 | adventure-start (test) | 0 |
| 31/08/2026, 02:27:23 | Absolution: loss; REAPER: win; VuHy: loss | 88 | 15–15 | mid-match-recovery | 0 |
| 30/08/2026, 00:59:03 | Absolution: loss; REAPER: win | 40 | 20–21 | mid-match-recovery | 5 |
| 29/08/2026, 17:06:42 | Absolution: win; VuHy: loss | 61 | 9–9 | mid-match-recovery | 0 |
| 29/08/2026, 11:08:17 | Absolution: loss; VuHy: win | 22 | 8–8 | legacy/unknown | 0 |

## Every match result

| Finished (Bangkok) | Participants | Replay stored | Match ID |
|---|---|---|---|
| 05/09/2026, 19:07:44 | HanzoVie: loss; Dra: win | no | room-room-olynbt-2eef8fac-b62b-4c55-9d2a-ee1cda54da1f |
| 05/09/2026, 16:47:07 | Absolution: loss; HanzoVie: win | yes | room-room-5fcaqr-34094281-d1f7-4663-a84d-db689cc84d86 |
| 05/09/2026, 15:17:02 | Absolution: win; HanzoVie: abandon | yes | room-room-t2cj26-046664d8-bc55-4e3a-8cb6-7cff94ebeae4 |
| 05/09/2026, 14:56:30 | Absolution: loss; HanzoVie: win | yes | room-room-bti4so-01ceeba2-c22f-4722-90c3-7857c6a99673 |
| 05/09/2026, 13:36:53 | HanzoVie: win; Dra: abandon | no | room-room-olynbt-99df94f0-ea3c-4235-9cc0-54b512e57f6f |
| 04/09/2026, 18:58:23 | theBigMike: loss; Dra: win | yes | room-room-66n5am-06f994eb-8c87-4b7c-94f8-278e8806195f |
| 03/09/2026, 23:16:47 | Absolution: win; REAPER: loss | yes | room-room-06j7su-de16b1a5-c245-4ed2-9227-61edb0cd268f |
| 03/09/2026, 21:47:07 | HanzoVie: win; Dra: loss | yes | room-room-eltbl2-9588dd48-d05c-4fd1-8461-c3f71567ffc3 |
| 03/09/2026, 21:08:37 | Dra: abandon; HanzoVie: win | yes | room-room-7at094-b36adc98-d4f9-4689-9e9b-829c8d37bee3 |
| 03/09/2026, 13:02:32 | Dra: abandon; HanzoVie: win | yes | room-room-x7njnb-84a9ab63-34f1-4418-bd68-4135db522fe4 |
| 03/09/2026, 00:17:40 | Absolution: win; REAPER: loss | yes | room-room-bi3xov-cbdbaa8b-25f9-4542-af0d-14f1edad39b3 |
| 02/09/2026, 23:10:32 | Dra: loss; HanzoVie: win | yes | room-room-jc13qs-f74698cc-09d8-4efc-a9b8-790262007ade |
| 02/09/2026, 22:29:27 | Absolution: abandon; Dra: win; HanzoVie: loss | yes | room-room-g3i6bg-91a3d8f3-0db9-4418-ad3f-248b7bf90e1f |
| 02/09/2026, 18:17:13 | Absolution: win; HanzoVie: loss; Dra: loss | yes | room-room-87s9sz-24aa64ef-ed05-4fa5-96ce-523919fd17fe |
| 02/09/2026, 16:40:28 | Absolution: loss; REAPER: win | yes | room-room-qzb56c-b112fcdd-b72d-4b0d-af82-af58a0bdf6d2 |
| 02/09/2026, 14:40:58 | Absolution: loss; REAPER: win | yes | room-room-h5ucjy-e4e72596-ea60-4127-98db-749113427fc4 |
| 01/09/2026, 10:51:57 | ProofA1788188791: loss; ProofB1788188791: win | yes | room-codex-replay-race-proof-1788233360-6f955bea-7a7c-4497-aa29-15ad6b5b7fe5 |
| 01/09/2026, 03:44:25 | ProofA1788188791: win; ProofB1788188791: loss | yes | room-codex-replay-proof-1788207269-1c5e80bd-c608-413b-a029-26e293714eb5 |
| 01/09/2026, 02:30:33 | ProofA1788188791: win; ProofB1788188791: loss | yes | room-codex-replay-route-1788203625-5d572a1c-af13-4289-9b72-00af09807da9 |
| 01/09/2026, 01:56:37 | ProofA1788188791: loss; ProofB1788188791: win | yes | room-codex-replay-cold-1788201611-4cd93d76-f423-4be1-b6f1-cd33a761b9f1 |
| 01/09/2026, 01:35:39 | ProofA1788188791: win; ProofB1788188791: loss | yes | room-codex-replay-fixed-1788199210-63099bec-b45b-4fd1-acfb-5f6eaea88108 |
| 01/09/2026, 00:40:13 | ProofA1788188791: win; ProofB1788188791: loss | yes | room-codex-replay-proof-1788195833-15b677a2-07ed-4a69-b16b-13c5b0996f69 |
| 31/08/2026, 19:17:19 | R1BattleA8170184: win; R1BattleB8170184: loss | yes | room-codex-skirmish-real-1788170184-dad1aeeb-0f0d-42f1-9202-1e40d3a782dd |
| 31/08/2026, 16:44:44 | R1ProofA8160618: loss; R1ProofB8160618: win | yes | room-codex-fullgame-1788169459-2462c05d-d9ca-463e-b436-d10fd877a62f |
| 31/08/2026, 16:43:34 | R1ProofA8160618: win; R1ProofB8160618: loss | yes | room-codex-six-round-1788169285-9d0749e9-9395-4f93-a078-8648a55109a3 |
| 31/08/2026, 16:38:00 | R1ProofA8160618: win; R1ProofB8160618: loss | yes | room-codex-restart-proof-1788169017-128d7bd4-aee3-4d3c-9414-cb60096229fe |
| 31/08/2026, 15:15:03 | Absolution: win; REAPER: loss | yes | room-room-9ji5pd-d80a7d1b-b4c3-4f8c-9a6b-5cee181e3306 |
| 31/08/2026, 14:46:15 | R1LiveA8160074: win; R1LiveB8160074: loss | yes | room-codex-r1-live2-8160074-60b5628e-1f86-4f41-b859-54e6926844b1 |
| 31/08/2026, 14:41:13 | R1ProofA8160618: win; R1ProofB8160618: loss | yes | room-codex-real-4round-1788162018-019682be-0e5b-4e30-a31b-919d2da1bc9d |
| 31/08/2026, 14:33:49 | R1ProofA8160618: win; R1ProofB8160618: loss | yes | room-codex-r1-proof-8160618-9a0e85af-bd87-4bd8-85f0-53178488c8d7 |
| 31/08/2026, 02:27:25 | Absolution: loss; REAPER: win; VuHy: loss | yes | room-room-n1b23b-b23fd41e-fd9f-47dc-bc34-c559a96f76fe |
| 30/08/2026, 00:59:05 | Absolution: loss; REAPER: win | yes | room-room-1d3wbm-161317eb-34d9-4171-a75b-790e1e19ffa5 |
| 29/08/2026, 17:06:27 | Absolution: win; VuHy: loss | yes | room-room-nciy4l-6abdbc3c-57ca-450e-868e-10c2fa4bc439 |
| 29/08/2026, 11:08:19 | Absolution: loss; VuHy: win | yes | room-room-wq934y-c9810333-f3a9-4316-90ef-b199beea5dfa |
| 27/08/2026, 22:52:09 | Absolution: loss; REAPER: win | no | room-room-hnnyqs-6513fbed-5558-43c2-82aa-bd8accb836de |
| 27/08/2026, 22:25:01 | Absolution: loss; REAPER: win | no | room-room-r9smbs-cfb318a7-a590-48b7-9506-b4bf92cfce94 |
| 27/08/2026, 21:33:32 | Absolution: win; REAPER: loss | no | room-room-oks50o-32822145-24c9-4c33-8f82-285cf9494084 |
| 26/08/2026, 22:49:00 | Absolution: loss; REAPER: win | no | room-room-ilvtgv-2a5dd51b-a2c6-4a3a-af1c-8a68853e0a5d |
| 26/08/2026, 22:13:42 | Absolution: loss; REAPER: win | no | room-room-48sqtt-c38c257e-8a8d-489f-9d0c-b46860f24622 |
| 26/08/2026, 22:08:16 | Absolution: win; REAPER: loss | no | room-room-n5irhw-afe56cd0-0df7-4f6b-b42d-b3c89aa3d1ef |
| 26/08/2026, 21:48:59 | Absolution: loss; REAPER: win | no | room-room-5kgie7-f15a70a7-f5aa-4a60-a902-eb80a6972c0e |
| 25/08/2026, 23:14:01 | Absolution: win; REAPER: loss | no | room-room-z1azad-0d24fd4b-e125-420b-ba3f-67892165a52c |
| 24/08/2026, 22:56:55 | Absolution: win; REAPER: loss | no | room-room-ofc6e6-97e807ea-d4c1-4224-ad7d-41555edb7878 |
| 24/08/2026, 22:25:57 | Absolution: loss; REAPER: win | no | room-room-hg5dga-ae3e6441-1e31-4942-8f3e-9f6d066751cc |
| 23/08/2026, 23:27:02 | Absolution: win; REAPER: loss | no | room-room-dfyaou-5ac533a6-7cec-4bc8-81d3-c1e26c2ff18b |
| 23/08/2026, 18:35:24 | Absolution: win; REAPER: abandon | no | room-room-sjmjsq-ed365171-f19f-43c2-834b-27fdbeab7a8b |
| 23/08/2026, 01:16:38 | Absolution: win; REAPER: loss | no | room-room-cflgbq-a8f9edec-7ebf-4502-addf-780c46849757 |
| 21/08/2026, 23:47:03 | Absolution: win; REAPER: loss | no | room-room-774nt3-f5669d43-224c-4db9-8fa9-f3535d7786bb |
| 21/08/2026, 22:41:32 | Absolution: win; REAPER: loss | no | room-room-2u54dz-c94435f7-26a1-4169-97bf-21e896902981 |
| 14/08/2026, 21:28:23 | Absolution: win; REAPER: loss | no | room-room-zu8s5l-2b3ddd95-ff7c-4724-b9d1-6c9b47979bb6 |
| 13/08/2026, 21:26:39 | Absolution: loss; REAPER: win | no | room-room-512wex-a8d14bf0-f563-4dfd-806d-e2dcbe42fdac |
| 12/08/2026, 00:45:55 | Absolution: win; REAPER: loss | no | room-room-5y5k2y-bde224ea-97d9-49fd-84f1-c81e0a68f9a0 |
| 10/08/2026, 01:10:56 | Absolution: loss; REAPER: win | no | room-room-wpltbr-8ff5340e-4329-4d4e-ae6c-225d3a57de5d |
| 10/08/2026, 00:20:27 | superkge: win; Conduch: abandon | no | room-room-n5byym-e3ade8d8-d594-450a-ab1f-846d3d4d4680 |
| 09/08/2026, 22:39:03 | Absolution: win; REAPER: loss | no | room-room-n6ywfx-8d28258e-2c4a-4155-8a90-f8b453e61c4b |
| 08/08/2026, 17:03:32 | Absolution: loss; REAPER: win | no | room-room-xqetnm-6fde0d4b-28cf-41c2-8048-9259eb6097e2 |
| 08/08/2026, 01:15:27 | barol: loss; Meandor: win | no | room-room-uqgi4d-df63f781-bd6a-4980-b5f1-c0f371f0a6bb |
| 25/07/2026, 01:34:20 | barol: loss; Meandor: win | no | room-room-2t3kl8-36e8c8c3-41a3-438b-b6ff-aec94ccb18ee |
| 17/07/2026, 23:36:57 | Absolution: loss; REAPER: win | no | room-room-2kepkc-6b923ce0-4002-4bff-9b44-d83f3c355903 |
| 16/07/2026, 01:30:48 | Absolution: win; Apostle of Khorne: loss | no | room-room-15mqgb-ed6d3d97-6853-4974-9977-b47bde3bf947 |
| 15/07/2026, 22:34:04 | REAPER: win; Baka Gato: loss | no | room-room-ipj5ir-8c24292a-3acf-405f-9443-2f00cbd0ceae |
| 13/07/2026, 23:41:40 | Absolution: win; REAPER: loss | no | room-room-mlbwsd-c2e6e3e5-7c12-4492-987c-cf8772d18fb5 |
| 13/07/2026, 00:11:08 | Absolution: win; REAPER: loss | no | room-room-t3rwli-78d79d8f-0643-4e89-acd1-461d09267029 |
| 12/07/2026, 11:28:13 | Absolution: win; Goodboy2006: abandon | no | room-room-jyrshb-b494d6fe-d0af-4cd0-8f4a-7499071714c3 |
| 04/07/2026, 11:01:11 | CodexA1783137659: win; CodexB1783137659: loss | no | codex-verification-1783137659 |
