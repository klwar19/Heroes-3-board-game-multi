/**
 * Sandro's lessons for the guided tutorial game — EDIT FREELY.
 *
 * Each lesson pops once, the first time its `when` test holds for the moment
 * the player is looking at (the next scripted move, the game state). Lessons
 * are keyed by what is happening, not by step numbers, so they keep working
 * when the tutorial game is re-recorded (scripts/tutorial/record-tutorial.mjs)
 * after rules change. Order matters: the first unseen matching lesson wins.
 *
 * Text is given in English, Vietnamese and Polish (tutorial-i18n.ts); in-game
 * button names stay English because the game UI is English. **Double stars**
 * mark bold. `rulebook` is a page of the in-app Rule Book ("Read more").
 * `pose` picks Sandro's art; `chapter` picks the medal / chapter track.
 * The coach separately shows the exact move ("Your move: …") with a pointer
 * and a "Watch how" clip, so lessons explain WHY, not which button.
 */
import type { GameAction, GameState } from "@/engine";
import type { Localized, TutorialChapterId } from "./tutorial-i18n";

export type SandroPose = "teach" | "cheer" | "warn" | "think";

export type LessonMoment = {
  state: GameState;
  /** The player's next scripted move, if it is their move. */
  expected: GameAction | null;
  mode: "lobby" | "script" | "free" | "done" | "loading";
  computerThinking: boolean;
};

export type TutorialLesson = {
  id: string;
  chapter: TutorialChapterId;
  title: Localized;
  pose: SandroPose;
  body: Localized[];
  rulebook?: number;
  when: (moment: LessonMoment) => boolean;
};

const is = (moment: LessonMoment, ...types: GameAction["type"][]) =>
  Boolean(moment.expected && types.includes(moment.expected.type));
const inCombat = (moment: LessonMoment) => Boolean(moment.state.combat && !moment.state.combat.outcome);
const pvpCombat = (moment: LessonMoment) => {
  const combat = moment.state.combat;
  return Boolean(
    combat &&
      combat.attackerPlayerId !== "neutrals" &&
      combat.defenderPlayerId !== "neutrals" &&
      combat.attackerPlayerId in moment.state.players &&
      combat.defenderPlayerId in moment.state.players,
  );
};
const mainHero = (moment: LessonMoment) =>
  Object.values(moment.state.heroes ?? {}).find((hero) => hero.controllerId === "p1" && hero.kind === "main");
/** You hold two towns = the enemy's town is flagged by you. */
const enemyTownFlaggedByYou = (moment: LessonMoment) =>
  Object.values(moment.state.adventure?.fields ?? {}).filter((field) => field.location === "town" && field.flagOwnerId === "p1").length >= 2;
const siegeCombat = (moment: LessonMoment) => {
  const context = moment.state.combat?.context;
  return Boolean(context && context.kind === "player" && (context.siege || context.holdingDefense));
};
const lobbySeat = (moment: LessonMoment, playerId: string) => moment.state.setupLobby?.seats.find((seat) => seat.playerId === playerId);
const playingCard = (moment: LessonMoment, prefix: string) =>
  Boolean(moment.expected && "cardId" in moment.expected && String((moment.expected as { cardId?: string }).cardId).startsWith(prefix));

export const TUTORIAL_LESSONS: TutorialLesson[] = [
  // ------------------------------------------------------------------ setup
  {
    id: "welcome",
    chapter: "setup",
    title: { en: "Welcome, apprentice", vi: "Chào mừng, học trò", pl: "Witaj, uczniu" },
    pose: "teach",
    body: [
      {
        en: "I am **Sandro**, and today you learn the Heroes III board game the way I learned it: by winning. We play **one whole game** together — you as **Necropolis**, against a **Castle** computer.",
        vi: "Ta là **Sandro**, và hôm nay ngươi sẽ học Heroes III bản board game theo cách ta đã học: bằng chiến thắng. Chúng ta chơi **trọn một ván** — ngươi cầm **Necropolis**, đấu với máy cầm **Castle**.",
        pl: "Jestem **Sandro** i dziś nauczysz się planszowego Heroes III tak jak ja — wygrywając. Rozegramy razem **całą partię**: ty jako **Nekropolia** przeciwko komputerowi grającemu **Zamkiem**.",
      },
      {
        en: "This is the **setup lobby**, where every game begins: map, rules and a town for each seat. Learn it with me (four clicks), or let me set it up and jump straight into the game.",
        vi: "Đây là **phòng thiết lập** — ván nào cũng bắt đầu ở đây: chọn bản đồ, luật và thành cho mỗi ghế. Học cùng ta (bốn cú nhấp), hoặc để ta thiết lập sẵn và vào trận ngay.",
        pl: "To **lobby ustawień** — tu zaczyna się każda gra: mapa, zasady i miasto dla każdego miejsca. Naucz się tego ze mną (cztery kliknięcia) albo pozwól, że ustawię wszystko i od razu zaczniemy.",
      },
    ],
    rulebook: 12,
    when: (m) => m.mode === "lobby",
  },
  {
    id: "lobby-rules",
    chapter: "setup",
    title: { en: "Map, rules and victory", vi: "Bản đồ, luật và chiến thắng", pl: "Mapa, zasady i zwycięstwo" },
    pose: "think",
    body: [
      {
        en: "The **Skirmish** map is the usual one: each player starts on their own town tile, with face-down tiles between you that get harder toward the centre.",
        vi: "Bản đồ **Skirmish** là bản đồ quen thuộc: mỗi người bắt đầu ở mảnh có thành của mình, giữa hai bên là các mảnh úp, càng vào giữa càng khó.",
        pl: "Mapa **Skirmish** to ta standardowa: każdy zaczyna na kaflu ze swoim miastem, a między wami leżą zakryte kafle — im bliżej środka, tym trudniejsze.",
      },
      {
        en: "**Rules**: *BINH* is this app's house-rule set (balance fixes, split Spell and Artifact decks; every rule can be toggled). *Legacy* plays the community rule book as printed.",
        vi: "**Luật**: *BINH* là bộ luật nhà của ứng dụng này (cân bằng lại, tách bộ bài Phép và Bảo vật; từng luật đều bật/tắt được). *Legacy* chơi đúng như sách luật cộng đồng.",
        pl: "**Zasady**: *BINH* to domowe zasady tej aplikacji (poprawki balansu, osobne talie Czarów i Artefaktów; każdą można wyłączyć). *Legacy* to instrukcja społeczności w wersji drukowanej.",
      },
      {
        en: "**Victory — Conquest**: knock everyone else out. Take a player's town and settlements, and they have two turns to win one back before they are eliminated.",
        vi: "**Chiến thắng — Chinh phục**: loại tất cả đối thủ. Chiếm thành và các khu định cư của một người, họ có hai lượt để giành lại, nếu không sẽ bị loại.",
        pl: "**Zwycięstwo — Podbój**: wyeliminuj wszystkich. Zajmij miasto i osady gracza — ma dwie tury, by coś odbić, inaczej odpada.",
      },
    ],
    rulebook: 10,
    when: (m) => m.mode === "lobby",
  },
  {
    id: "lobby-difficulty",
    chapter: "setup",
    title: { en: "Difficulty", vi: "Độ khó", pl: "Poziom trudności" },
    pose: "teach",
    body: [
      {
        en: "**Difficulty** sets how strong the neutral guards on the map are: Easy, Normal, Hard or Impossible. **Normal** is fair for a first game.",
        vi: "**Độ khó** quyết định lính canh trung lập trên bản đồ mạnh cỡ nào: Easy, Normal, Hard hay Impossible. **Normal** là vừa sức cho ván đầu.",
        pl: "**Poziom trudności** określa siłę neutralnych strażników na mapie: Easy, Normal, Hard lub Impossible. **Normal** jest w sam raz na pierwszą grę.",
      },
    ],
    rulebook: 10,
    when: (m) => m.mode === "lobby" && lobbySeat(m, "p1")?.factionId === "necropolis",
  },

  // ------------------------------------------------------------- first round
  {
    id: "the-map",
    chapter: "first-round",
    title: { en: "The adventure map", vi: "Bản đồ phiêu lưu", pl: "Mapa przygody" },
    pose: "teach",
    body: [
      {
        en: "This is your **starting tile**, with your **town** in the middle. Each tile has 7 fields. A Roman numeral on a field means **neutral guards** — beat them to visit it.",
        vi: "Đây là **mảnh khởi đầu** của ngươi, **thành** nằm ở giữa. Mỗi mảnh có 7 ô. Số La Mã trên ô nghĩa là có **lính canh trung lập** — đánh thắng chúng mới vào được.",
        pl: "To twój **kafel startowy** z **miastem** pośrodku. Każdy kafel ma 7 pól. Rzymska cyfra na polu oznacza **neutralnych strażników** — pokonaj ich, by odwiedzić pole.",
      },
      {
        en: "Each step costs **1 movement point**. Your starting tile has the weakest guards (rank I), so grab the **mine** and the **treasure** next to you first.",
        vi: "Mỗi bước tốn **1 điểm di chuyển**. Lính canh ở mảnh khởi đầu yếu nhất (hạng I), nên hãy lấy **mỏ** và **kho báu** ngay cạnh ngươi trước.",
        pl: "Każdy krok kosztuje **1 punkt ruchu**. Na kaflu startowym są najsłabsi strażnicy (ranga I) — najpierw zgarnij **kopalnię** i **skarb** tuż obok.",
      },
    ],
    rulebook: 31,
    when: (m) => m.mode === "script" && m.state.round === 1 && !m.state.combat,
  },
  {
    id: "home-rotation",
    chapter: "first-round",
    title: { en: "Turning your home tile", vi: "Xoay mảnh nhà", pl: "Obracanie kafla startowego" },
    pose: "think",
    body: [
      {
        en: "Before your first step you may **rotate your home tile** for free. Point the fields you want toward the rest of the map.",
        vi: "Trước bước đầu tiên, ngươi được **xoay mảnh nhà** miễn phí. Hãy hướng những ô ngươi cần về phía phần còn lại của bản đồ.",
        pl: "Przed pierwszym krokiem możesz za darmo **obrócić swój kafel startowy**. Skieruj potrzebne pola w stronę reszty mapy.",
      },
    ],
    rulebook: 32,
    when: (m) => is(m, "SET_TILE_ROTATION") && m.state.round === 1,
  },
  {
    id: "starting-hand",
    chapter: "first-round",
    title: { en: "Your deck and hand", vi: "Bộ bài và bài trên tay", pl: "Twoja talia i ręka" },
    pose: "think",
    body: [
      {
        en: "Your hero owns a **deck of cards**: Statistics (Attack, Defense, Power, Knowledge), Abilities, Spells, Artifacts and the hero's **Specialty**. You draw a hand and play it on the map and in battle.",
        vi: "Tướng của ngươi có một **bộ bài**: Chỉ số (Attack, Defense, Power, Knowledge), Kỹ năng, Phép, Bảo vật và **Đặc tài** của tướng. Ngươi rút bài lên tay và dùng trên bản đồ lẫn trong trận.",
        pl: "Twój bohater ma **talię kart**: Statystyki (Attack, Defense, Power, Knowledge), Umiejętności, Czary, Artefakty i swoją **Specjalność**. Dobierasz rękę i zagrywasz ją na mapie i w bitwie.",
      },
      {
        en: "At the very start you may **mulligan**: send back cards you don't want and draw again.",
        vi: "Ngay đầu ván ngươi được **đổi bài (mulligan)**: trả lại những lá không muốn và rút lại.",
        pl: "Na samym początku możesz zrobić **mulligan**: odłożyć niechciane karty i dobrać nowe.",
      },
    ],
    rulebook: 22,
    when: (m) => is(m, "OPENING_HAND_MULLIGAN", "MULLIGAN_CARD", "REFRESH_HAND") && m.state.round === 1,
  },

  // ----------------------------------------------------------------- combat
  {
    id: "combat-setup",
    chapter: "battle",
    title: { en: "Deploying your army", vi: "Dàn quân", pl: "Rozstawienie armii" },
    pose: "teach",
    body: [
      {
        en: "A battle! Up to **5 units** fight. Put sturdy fighters in front; keep shooters and fragile units behind them.",
        vi: "Vào trận! Tối đa **5 đơn vị** được chiến đấu. Đặt quân chắc chắn lên trước, quân bắn xa và quân yếu ở phía sau.",
        pl: "Bitwa! Walczy do **5 jednostek**. Wytrzymałe oddziały z przodu, strzelcy i słabsi za nimi.",
      },
      {
        en: "Each unit card shows **Attack**, **Defense**, **Health** and **Initiative**. Units have a weaker **Few** side and a stronger **Pack** side.",
        vi: "Mỗi lá quân ghi **Attack**, **Defense**, **Health** và **Initiative**. Quân có mặt yếu **Few** và mặt mạnh **Pack**.",
        pl: "Każda karta jednostki ma **Attack**, **Defense**, **Health** i **Initiative**. Jednostki mają słabszą stronę **Few** i silniejszą **Pack**.",
      },
    ],
    rulebook: 41,
    when: (m) => is(m, "PLACE_COMBAT_UNIT", "FINISH_COMBAT_PLACEMENT"),
  },
  {
    id: "combat-activation",
    chapter: "battle",
    title: { en: "Taking turns in battle", vi: "Lần lượt trong trận", pl: "Kolejność w bitwie" },
    pose: "teach",
    body: [
      {
        en: "Units act by **Initiative**, highest first. An active unit may move and attack, or **defend** for a Defense token.",
        vi: "Quân hành động theo **Initiative**, cao nhất đi trước. Quân đến lượt có thể di chuyển và tấn công, hoặc **phòng thủ** để nhận thẻ Defense.",
        pl: "Jednostki działają według **Initiative** — najwyższa pierwsza. Aktywna jednostka może się ruszyć i zaatakować albo się **bronić** (żeton Defense).",
      },
      {
        en: "An attack rolls the **Attack die** (−1, 0 or +1): Attack + die − the target's Defense is the damage. A unit that survives a melee hit **retaliates** once per combat round.",
        vi: "Mỗi đòn tấn công gieo **xúc xắc Attack** (−1, 0 hoặc +1): Attack + xúc xắc − Defense của mục tiêu là sát thương. Quân sống sót sau đòn cận chiến sẽ **phản đòn** một lần mỗi vòng giao tranh.",
        pl: "Atak to rzut **kością ataku** (−1, 0 lub +1): Attack + kość − Defense celu = obrażenia. Jednostka, która przeżyje cios wręcz, **kontratakuje** raz na rundę walki.",
      },
    ],
    rulebook: 43,
    when: (m) => inCombat(m) && is(m, "MOVE_UNIT", "ATTACK_UNIT", "MOVE_AND_ATTACK_UNIT", "DEFEND_UNIT", "WAIT_UNIT"),
  },
  {
    id: "combat-reactions",
    chapter: "battle",
    title: { en: "Cards in battle", vi: "Dùng bài trong trận", pl: "Karty w bitwie" },
    pose: "think",
    body: [
      {
        en: "Before an attack lands, both sides may **play cards**: **Attack** hits harder, **Defense** shrugs off damage, spells like **Magic Arrow** deal damage directly. Only **one spell per combat round**.",
        vi: "Trước khi đòn đánh trúng, cả hai bên được **đánh bài**: **Attack** đánh mạnh hơn, **Defense** đỡ sát thương, phép như **Magic Arrow** gây sát thương trực tiếp. Mỗi vòng giao tranh chỉ **một phép**.",
        pl: "Zanim cios trafi, obie strony mogą **zagrywać karty**: **Attack** wzmacnia cios, **Defense** osłabia obrażenia, czary jak **Magic Arrow** ranią bezpośrednio. Tylko **jeden czar na rundę walki**.",
      },
      {
        en: "When a card isn't worth it, **pass**. Saving good cards for the big fights is half the art.",
        vi: "Khi lá bài không đáng dùng, hãy **bỏ qua**. Giữ bài tốt cho trận lớn là một nửa nghệ thuật.",
        pl: "Gdy karta się nie opłaca — **spasuj**. Oszczędzanie dobrych kart na duże walki to połowa sztuki.",
      },
    ],
    rulebook: 43,
    when: (m) => inCombat(m) && is(m, "PASS_REACTION", "PLAY_REACTION", "PLAY_CARD", "CAST_SPELL"),
  },
  {
    id: "combat-neutrals",
    chapter: "battle",
    title: { en: "The neutrals' turn", vi: "Lượt của quân trung lập", pl: "Tura neutralnych" },
    pose: "teach",
    body: [
      {
        en: "Neutral guards act on their own. On their activation, **continue** the battle and watch them move and strike.",
        vi: "Lính canh trung lập tự hành động. Đến lượt chúng, hãy **tiếp tục** trận đấu và xem chúng di chuyển, tấn công.",
        pl: "Neutralni strażnicy działają sami. W ich aktywacji **kontynuuj** bitwę i patrz, jak się ruszają i atakują.",
      },
    ],
    rulebook: 48,
    when: (m) => is(m, "CONTINUE_NEUTRAL_COMBAT", "CONTINUE_NEUTRAL_STEP", "AUTO_NEUTRAL_ACTIVATION"),
  },
  {
    id: "combat-end",
    chapter: "battle",
    title: { en: "Victory and experience", vi: "Chiến thắng và kinh nghiệm", pl: "Zwycięstwo i doświadczenie" },
    pose: "cheer",
    body: [
      {
        en: "Won! Battles give your hero **experience** — every 2 is a new **level**, up to VII. Then you **visit** the field you fought for: flag a mine, open a treasure…",
        vi: "Thắng rồi! Mỗi trận thắng cho tướng **kinh nghiệm** — cứ 2 điểm là lên một **cấp**, tối đa VII. Sau đó ngươi **ghé** ô vừa giành được: cắm cờ mỏ, mở kho báu…",
        pl: "Wygrana! Bitwy dają bohaterowi **doświadczenie** — co 2 punkty nowy **poziom**, aż do VII. Potem **odwiedzasz** zdobyte pole: flagujesz kopalnię, otwierasz skarb…",
      },
    ],
    rulebook: 44,
    when: (m) => is(m, "ACKNOWLEDGE_COMBAT_END"),
  },
  {
    id: "retreat",
    chapter: "battle",
    title: { en: "Knowing when to leave", vi: "Biết lúc rút lui", pl: "Wiedzieć, kiedy odejść" },
    pose: "warn",
    body: [
      {
        en: "Not every fight must be finished. **Retreat** saves your army when the dice turn against you — live to fight another day.",
        vi: "Không phải trận nào cũng phải đánh đến cùng. **Rút lui** giữ lại quân khi xúc xắc quay lưng — còn quân là còn cơ hội.",
        pl: "Nie każdą walkę trzeba kończyć. **Odwrót** ratuje armię, gdy kości są przeciw tobie — przeżyj, by walczyć dalej.",
      },
    ],
    rulebook: 44,
    when: (m) => is(m, "RETREAT_FROM_COMBAT"),
  },
  {
    id: "necromancy",
    chapter: "battle",
    title: { en: "Necromancy", vi: "Chiêu hồn (Necromancy)", pl: "Nekromancja" },
    pose: "cheer",
    body: [
      {
        en: "My favourite part. **Necromancy** raises the fallen after a victory — skeletons join or reinforce your army. The dead are the cheapest recruits of all.",
        vi: "Phần ta thích nhất. **Necromancy** gọi kẻ ngã xuống đứng dậy sau chiến thắng — bộ xương gia nhập hoặc tăng cường quân ngươi. Người chết là tân binh rẻ nhất.",
        pl: "Moja ulubiona część. **Nekromancja** wskrzesza poległych po zwycięstwie — szkielety dołączają lub wzmacniają twoją armię. Umarli to najtańsi rekruci.",
      },
    ],
    when: (m) => m.state.adventure?.pendingNecromancy?.playerId === "p1",
  },

  // --------------------------------------------------------------- exploring
  {
    id: "visit",
    chapter: "exploring",
    title: { en: "Visiting fields", vi: "Ghé các ô", pl: "Odwiedzanie pól" },
    pose: "teach",
    body: [
      {
        en: "Stepping on an unguarded field **visits** it. **Mines** flag to you and pay every resource round; a **treasure** rolls for resources, experience or cards; other sites have their own rewards.",
        vi: "Bước lên ô không có lính canh là **ghé** ô đó. **Mỏ** sẽ cắm cờ của ngươi và trả tài nguyên mỗi vòng tài nguyên; **kho báu** gieo ra tài nguyên, kinh nghiệm hoặc bài; các địa điểm khác có phần thưởng riêng.",
        pl: "Wejście na niestrzeżone pole to **odwiedziny**. **Kopalnie** dostają twoją flagę i płacą w każdej rundzie zasobów; **skarb** daje zasoby, doświadczenie lub karty; inne miejsca mają własne nagrody.",
      },
    ],
    rulebook: 73,
    when: (m) => is(m, "RESOLVE_VISIT_STEP", "REVISIT_FIELD") && m.state.round > 1,
  },
  {
    id: "choices",
    chapter: "exploring",
    title: { en: "Making a choice", vi: "Đưa ra lựa chọn", pl: "Wybór" },
    pose: "think",
    body: [
      {
        en: "Many rewards ask you to **choose**. The good one is under my pointer, and “Watch how” shows exactly where to tap.",
        vi: "Nhiều phần thưởng bắt ngươi **chọn**. Lựa chọn tốt nằm dưới bàn tay chỉ của ta, và “Xem cách làm” cho thấy chính xác chỗ cần bấm.",
        pl: "Wiele nagród wymaga **wyboru**. Dobra opcja jest pod moim wskaźnikiem, a „Zobacz jak” pokazuje dokładnie, gdzie kliknąć.",
      },
    ],
    when: (m) => is(m, "CHOOSE_OPTION"),
  },
  {
    id: "deck-search",
    chapter: "exploring",
    title: { en: "Searching a deck", vi: "Lục bộ bài", pl: "Przeszukiwanie talii" },
    pose: "teach",
    body: [
      {
        en: "**Search (X)**: look at the top X cards of a deck and keep one — or take the face-up card on its discard pile. This is how you gain new Abilities, Spells and Artifacts.",
        vi: "**Search (X)**: xem X lá trên cùng của một bộ bài và giữ một lá — hoặc lấy lá ngửa trên chồng bài bỏ. Đây là cách có thêm Kỹ năng, Phép và Bảo vật mới.",
        pl: "**Search (X)**: obejrzyj X wierzchnich kart talii i zatrzymaj jedną — albo weź odkrytą kartę ze stosu odrzuconych. Tak zdobywasz nowe Umiejętności, Czary i Artefakty.",
      },
    ],
    rulebook: 22,
    when: (m) => is(m, "RESOLVE_DECK_SEARCH", "SEARCH_DECK"),
  },
  {
    id: "end-turn",
    chapter: "exploring",
    title: { en: "Ending your turn", vi: "Kết thúc lượt", pl: "Koniec tury" },
    pose: "teach",
    body: [
      {
        en: "Out of useful moves? **End your turn** — the computer plays its turn and you can watch it. When everyone has played, a new **round** begins.",
        vi: "Hết nước đi có ích? **Kết thúc lượt** — máy sẽ chơi lượt của nó và ngươi có thể quan sát. Khi mọi người đã chơi xong, một **vòng** mới bắt đầu.",
        pl: "Brak sensownych ruchów? **Zakończ turę** — komputer rozegra swoją, a ty możesz patrzeć. Gdy wszyscy zagrają, zaczyna się nowa **runda**.",
      },
      {
        en: "Odd rounds from round 3 are **resource rounds**: income from your town, mines and settlements. Even rounds draw an **Astrologers** card with a table-wide effect.",
        vi: "Các vòng lẻ từ vòng 3 là **vòng tài nguyên**: thu nhập từ thành, mỏ và khu định cư. Vòng chẵn rút một lá **Astrologers** ảnh hưởng cả bàn.",
        pl: "Nieparzyste rundy od 3. to **rundy zasobów**: dochód z miasta, kopalń i osad. W parzystych dobiera się kartę **Astrologów** z efektem dla wszystkich.",
      },
    ],
    rulebook: 15,
    when: (m) => is(m, "END_TURN"),
  },
  {
    id: "computer-turn",
    chapter: "exploring",
    title: { en: "The enemy moves", vi: "Kẻ địch hành động", pl: "Ruch wroga" },
    pose: "think",
    body: [
      {
        en: "Castle is moving. Catherine clears her own starting tile, just as you did. Watch where she goes — sooner or later one of you will come for the other.",
        vi: "Castle đang đi. Catherine dọn dẹp mảnh khởi đầu của cô ta, y như ngươi đã làm. Hãy để ý cô ta đi đâu — sớm muộn gì một trong hai sẽ tìm đến người kia.",
        pl: "Zamek wykonuje ruch. Catherine czyści swój kafel startowy, tak jak ty. Patrz, dokąd idzie — prędzej czy później jedno z was ruszy na drugie.",
      },
    ],
    when: (m) => m.mode === "script" && m.computerThinking && !m.state.combat && m.state.round >= 1 && m.state.activePlayerId === "p2",
  },
  {
    id: "refresh-hand",
    chapter: "exploring",
    title: { en: "Refreshing your hand", vi: "Làm mới bài trên tay", pl: "Odświeżanie ręki" },
    pose: "teach",
    body: [
      {
        en: "At the start of each turn you **refresh your hand**: discard cards you don't want, then draw up to your **hand limit** (4 at first, growing with your hero's level).",
        vi: "Đầu mỗi lượt ngươi **làm mới bài**: bỏ những lá không cần, rồi rút cho đủ **giới hạn bài** (ban đầu 4, tăng theo cấp tướng).",
        pl: "Na początku każdej tury **odświeżasz rękę**: odrzucasz niechciane karty i dobierasz do **limitu ręki** (na start 4, rośnie z poziomem bohatera).",
      },
    ],
    rulebook: 17,
    when: (m) => is(m, "REFRESH_HAND") && m.state.round > 1,
  },
  {
    id: "tiles",
    chapter: "exploring",
    title: { en: "Opening the map", vi: "Mở rộng bản đồ", pl: "Odkrywanie mapy" },
    pose: "teach",
    body: [
      {
        en: "Face-down tiles hide the world. Stand next to one and **discover** it; you may also **lay a Far tile** from your supply at the map's edge. Higher numerals mean tougher guards — and richer rewards.",
        vi: "Các mảnh úp che giấu thế giới. Đứng cạnh một mảnh để **lật** nó; ngươi cũng có thể **đặt mảnh Far** từ kho ở rìa bản đồ. Số La Mã càng cao, lính canh càng mạnh — và phần thưởng càng lớn.",
        pl: "Zakryte kafle skrywają świat. Stań obok i **odkryj** kafel; możesz też **dołożyć kafel Far** z zapasu na brzegu mapy. Wyższa cyfra to silniejsi strażnicy — i bogatsze nagrody.",
      },
      {
        en: "When a tile goes down you choose its **rotation**. Point the fields you want toward your hero.",
        vi: "Khi đặt mảnh, ngươi chọn **hướng xoay**. Hãy hướng những ô ngươi cần về phía tướng.",
        pl: "Kładąc kafel wybierasz jego **obrót**. Skieruj potrzebne pola w stronę bohatera.",
      },
    ],
    rulebook: 32,
    when: (m) => is(m, "DISCOVER_TILE", "PLACE_TILE") || (is(m, "SET_TILE_ROTATION") && m.state.round > 1),
  },

  // ------------------------------------------------------------------- town
  {
    id: "town-recruit",
    chapter: "town",
    title: { en: "Recruiting", vi: "Chiêu mộ quân", pl: "Rekrutacja" },
    pose: "teach",
    body: [
      {
        en: "Once per round the **Population** token lets you **recruit** units from your dwellings or **reinforce** a Few unit to its Pack side.",
        vi: "Mỗi vòng một lần, thẻ **Population** cho ngươi **chiêu mộ** quân từ nhà lính hoặc **tăng cường** quân Few lên mặt Pack.",
        pl: "Raz na rundę żeton **Population** pozwala **rekrutować** jednostki z siedlisk albo **wzmocnić** jednostkę Few do strony Pack.",
      },
      {
        en: "Only 5 units fight, so choose quality: one gold-tier Pack outweighs a crowd of skeletons.",
        vi: "Chỉ 5 đơn vị được ra trận, nên hãy chọn chất lượng: một Pack hạng vàng đáng giá hơn cả đám bộ xương.",
        pl: "Walczy tylko 5 jednostek, więc liczy się jakość: jeden złoty Pack jest wart więcej niż tłum szkieletów.",
      },
    ],
    rulebook: 36,
    when: (m) => is(m, "POPULATION_ACTION"),
  },
  {
    id: "town-build",
    chapter: "town",
    title: { en: "Building", vi: "Xây dựng", pl: "Budowanie" },
    pose: "teach",
    body: [
      {
        en: "Your **town** raises **one building per round**. **Dwellings** unlock units (bronze, silver, gold); the **Citadel** lets you reinforce and guards the town; the **Mage Guild** gives spells; the **City Hall** adds income.",
        vi: "**Thành** của ngươi xây **một công trình mỗi vòng**. **Nhà lính** mở khóa quân (đồng, bạc, vàng); **Citadel** cho phép tăng cường quân và bảo vệ thành; **Mage Guild** cho phép; **City Hall** tăng thu nhập.",
        pl: "Twoje **miasto** stawia **jeden budynek na rundę**. **Siedliska** odblokowują jednostki (brąz, srebro, złoto); **Cytadela** pozwala wzmacniać i broni miasta; **Gildia Magów** daje czary; **Ratusz** zwiększa dochód.",
      },
      {
        en: "Buildings cost **gold**, **building materials** and **valuables** — mines are how you afford them.",
        vi: "Công trình tốn **vàng**, **vật liệu** và **đồ quý** — mỏ chính là nguồn chi trả.",
        pl: "Budynki kosztują **złoto**, **materiały** i **kosztowności** — na to zarabiają kopalnie.",
      },
    ],
    rulebook: 30,
    when: (m) => is(m, "BUILD_STRUCTURE"),
  },
  {
    id: "secondary-hero",
    chapter: "town",
    title: { en: "A second hero", vi: "Tướng thứ hai", pl: "Drugi bohater" },
    pose: "cheer",
    body: [
      {
        en: "For 10 gold you may hire a **Secondary Hero** in a town or settlement. They explore and flag fields while your main hero fights — but only the main hero uses your deck.",
        vi: "Với 10 vàng ngươi có thể thuê **tướng phụ** ở thành hoặc khu định cư. Tướng phụ đi khám phá và cắm cờ trong khi tướng chính đánh trận — nhưng chỉ tướng chính dùng được bộ bài.",
        pl: "Za 10 złota możesz wynająć **drugiego bohatera** w mieście lub osadzie. Zwiedza i flaguje pola, gdy główny bohater walczy — ale tylko główny używa twojej talii.",
      },
    ],
    rulebook: 20,
    when: (m) => is(m, "HIRE_SECONDARY_HERO"),
  },
  {
    id: "market",
    chapter: "town",
    title: { en: "Trading", vi: "Buôn bán", pl: "Handel" },
    pose: "think",
    body: [
      {
        en: "Short of one resource and rich in another? **Trade** at a market. The rates are poor, but a finished building beats a pile of idle ore.",
        vi: "Thiếu tài nguyên này, thừa tài nguyên kia? **Đổi** ở chợ. Tỷ giá không tốt, nhưng một công trình xây xong vẫn hơn đống quặng nằm im.",
        pl: "Brakuje jednego zasobu, a drugiego masz w bród? **Handluj** na targu. Kurs jest kiepski, ale gotowy budynek jest lepszy niż leżąca ruda.",
      },
    ],
    rulebook: 52,
    when: (m) => is(m, "TRADE_RESOURCES", "OPEN_MARKET"),
  },

  // --------------------------------------------------------------- growing
  {
    id: "level-up",
    chapter: "growing",
    title: { en: "Level up!", vi: "Lên cấp!", pl: "Awans!" },
    pose: "cheer",
    body: [
      {
        en: "Your hero gained a level. At levels **II, III, V and VII** you search the **Ability** deck and keep one; at the gold levels you gain your next **Specialty**. Levels also raise your **hand limit** and your **Expert** uses per round.",
        vi: "Tướng của ngươi vừa lên cấp. Ở cấp **II, III, V và VII** ngươi lục bộ **Kỹ năng** và giữ một lá; ở các cấp vàng ngươi nhận **Đặc tài** tiếp theo. Lên cấp còn tăng **giới hạn bài** và số lần dùng **Expert** mỗi vòng.",
        pl: "Bohater awansował. Na poziomach **II, III, V i VII** przeszukujesz talię **Umiejętności** i zatrzymujesz jedną; na złotych poziomach dostajesz kolejną **Specjalność**. Poziomy zwiększają też **limit ręki** i liczbę efektów **Expert** na rundę.",
      },
    ],
    rulebook: 21,
    when: (m) => (mainHero(m)?.level ?? 1) >= 2,
  },
  {
    id: "spells",
    chapter: "growing",
    title: { en: "Spells and the Spell Book", vi: "Phép và Sách phép", pl: "Czary i Księga Czarów" },
    pose: "think",
    body: [
      {
        en: "Spells are cards too. With the **Spell Book** rule you can file a spell away so it doesn't clog your hand, and buy new ones with the Spell Book token. **Power** boosts a spell.",
        vi: "Phép cũng là bài. Với luật **Sách phép**, ngươi cất phép vào sách để khỏi chật tay, và mua phép mới bằng thẻ Spell Book. **Power** tăng sức mạnh phép.",
        pl: "Czary to też karty. Z zasadą **Księgi Czarów** odkładasz czar, by nie zapychał ręki, i kupujesz nowe żetonem Spell Book. **Power** wzmacnia czar.",
      },
      {
        en: "Many cards have a **Basic** and an **Expert** effect. Expert is stronger, but limited per round by your level.",
        vi: "Nhiều lá có hiệu ứng **Basic** và **Expert**. Expert mạnh hơn nhưng số lần mỗi vòng bị giới hạn theo cấp.",
        pl: "Wiele kart ma efekt **Basic** i **Expert**. Expert jest silniejszy, ale ograniczony na rundę poziomem bohatera.",
      },
    ],
    rulebook: 26,
    when: (m) => is(m, "MOVE_SPELL_TO_SPELL_BOOK", "SPELL_BOOK_ACTION", "CAST_SPELL"),
  },
  {
    id: "artifacts",
    chapter: "growing",
    title: { en: "Artifacts", vi: "Bảo vật", pl: "Artefakty" },
    pose: "teach",
    body: [
      {
        en: "**Artifacts** are treasures in your deck — play them for strong one-off or lasting effects. In BINH rules they come as **Minor**, **Major** and **Relic** decks; better ones appear as you grow and explore deeper.",
        vi: "**Bảo vật** là báu vật trong bộ bài — dùng để có hiệu ứng mạnh một lần hoặc lâu dài. Trong luật BINH có các bộ **Minor**, **Major** và **Relic**; càng lên cấp và đi sâu càng gặp bảo vật tốt.",
        pl: "**Artefakty** to skarby w twojej talii — dają silne jednorazowe lub trwałe efekty. W zasadach BINH są talie **Minor**, **Major** i **Relic**; lepsze pojawiają się, gdy rośniesz i zapuszczasz się głębiej.",
      },
    ],
    rulebook: 27,
    when: (m) => is(m, "EQUIP_HERO_ITEM") || playingCard(m, "artifact."),
  },
  {
    id: "specialty",
    chapter: "growing",
    title: { en: "Your Specialty", vi: "Đặc tài của ngươi", pl: "Twoja Specjalność" },
    pose: "cheer",
    body: [
      {
        en: "Every hero has three **Specialty** cards — the first before the game, the others at higher levels. Mine revolve around the undead. Build your plan around yours.",
        vi: "Mỗi tướng có ba lá **Đặc tài** — lá đầu có từ trước ván, các lá sau ở cấp cao hơn. Của ta xoay quanh xác sống. Hãy lập kế hoạch quanh đặc tài của ngươi.",
        pl: "Każdy bohater ma trzy karty **Specjalności** — pierwszą przed grą, kolejne na wyższych poziomach. Moje kręcą się wokół nieumarłych. Buduj plan wokół swojej.",
      },
    ],
    when: (m) => playingCard(m, "specialty."),
  },
  {
    id: "morale",
    chapter: "growing",
    title: { en: "Morale — not for us", vi: "Sĩ khí — không dành cho ta", pl: "Morale — nie dla nas" },
    pose: "think",
    body: [
      {
        en: "Other towns gain and lose **Morale**: tokens to draw, cycle cards or reroll a die. We of the **Necropolis** feel nothing — no morale, good or bad, ever.",
        vi: "Các thành khác được và mất **Sĩ khí**: thẻ để rút bài, đổi bài hay gieo lại xúc xắc. Người **Necropolis** chúng ta vô cảm — không bao giờ có sĩ khí, dù tốt hay xấu.",
        pl: "Inne frakcje zyskują i tracą **Morale**: żetony do dobierania, wymiany kart czy przerzutu. My z **Nekropolii** nic nie czujemy — żadnego morale, dobrego ani złego.",
      },
    ],
    rulebook: 19,
    when: (m) => m.mode === "script" && (mainHero(m)?.level ?? 1) >= 3 && !m.state.combat,
  },

  // -------------------------------------------------------------------- war
  {
    id: "pvp",
    chapter: "war",
    title: { en: "Hero against hero", vi: "Tướng đấu tướng", pl: "Bohater na bohatera" },
    pose: "warn",
    body: [
      {
        en: "No mob of neutrals this time — **Catherine and her army**, and she plays cards too. Before accepting, play helpful artifacts and buy troops; in the fight, save your best cards for the key attacks.",
        vi: "Lần này không phải lính trung lập — mà là **Catherine và quân đội của cô ta**, và cô ta cũng đánh bài. Trước khi nhận trận, hãy dùng bảo vật có ích và mua thêm quân; trong trận, giữ bài tốt nhất cho những đòn quyết định.",
        pl: "Tym razem nie neutralni — to **Catherine i jej armia**, a ona też zagrywa karty. Przed akceptacją zagraj przydatne artefakty i dokup wojsko; w walce oszczędzaj najlepsze karty na kluczowe ataki.",
      },
    ],
    rulebook: 40,
    when: (m) => pvpCombat(m) || is(m, "ACCEPT_COMBAT"),
  },
  {
    id: "siege",
    chapter: "war",
    title: { en: "Taking the town", vi: "Chiếm thành", pl: "Zdobycie miasta" },
    pose: "warn",
    body: [
      {
        en: "Marching on an enemy **town** starts a **siege**: its walls and garrison fight back. Win, and the town's flag is yours.",
        vi: "Tiến vào **thành** địch là bắt đầu **công thành**: tường và quân đồn trú sẽ chống trả. Thắng thì cờ của thành là của ngươi.",
        pl: "Marsz na wrogie **miasto** zaczyna **oblężenie**: mury i garnizon się bronią. Wygraj, a flaga miasta będzie twoja.",
      },
    ],
    rulebook: 46,
    when: (m) => siegeCombat(m) && inCombat(m),
  },
  {
    id: "elimination",
    chapter: "war",
    title: { en: "The clock ticks — for them", vi: "Đồng hồ điểm — cho chúng", pl: "Zegar tyka — dla nich" },
    pose: "cheer",
    body: [
      {
        en: "Their town is ours! A player with **no town and no settlement** has **two turns** to retake one. Hold what you took and hunt down whatever they still own.",
        vi: "Thành của chúng đã về tay ta! Người chơi **không còn thành và khu định cư** có **hai lượt** để giành lại. Giữ chặt những gì đã chiếm và săn nốt những gì chúng còn.",
        pl: "Ich miasto jest nasze! Gracz **bez miasta i osady** ma **dwie tury**, by coś odbić. Utrzymaj zdobycze i dopadnij wszystko, co im zostało.",
      },
    ],
    when: (m) => enemyTownFlaggedByYou(m),
  },
  {
    id: "victory",
    chapter: "victory",
    title: { en: "Conquest!", vi: "Chinh phục!", pl: "Podbój!" },
    pose: "cheer",
    body: [
      {
        en: "**Castle is eliminated — you win!** You have played a whole game: setup, exploring, battles, town and economy, cards, spells, artifacts and levels.",
        vi: "**Castle đã bị loại — ngươi thắng!** Ngươi vừa chơi trọn một ván: thiết lập, khám phá, chiến đấu, thành và kinh tế, bài, phép, bảo vật và lên cấp.",
        pl: "**Zamek wyeliminowany — wygrywasz!** Rozegrałeś całą partię: ustawienia, eksplorację, bitwy, miasto i ekonomię, karty, czary, artefakty i poziomy.",
      },
      {
        en: "Next: **Single Player → Scenario** for a free game vs the computer, **Multiplayer → Skirmish** or **Co-op** with friends, and the **Map Editor** for your own worlds. The **Rule Book** is always one click away on the menu.",
        vi: "Tiếp theo: **Single Player → Scenario** để chơi tự do với máy, **Multiplayer → Skirmish** hoặc **Co-op** cùng bạn bè, và **Map Editor** để tự tạo thế giới. **Luật chơi** luôn ở ngay trên menu.",
        pl: "Dalej: **Single Player → Scenario** — swobodna gra z komputerem, **Multiplayer → Skirmish** lub **Co-op** ze znajomymi i **Map Editor** do tworzenia światów. **Instrukcja** jest zawsze pod ręką w menu.",
      },
    ],
    when: (m) => m.mode === "done",
  },
];
