/**
 * Tutorial-only translations (English, Vietnamese, Polish). The rest of the
 * app is English, so in-game button names inside hints stay in English
 * quotes — exactly what the player sees on screen.
 */
import type { TutorialLanguage } from "@/lib/tutorial/tutorial-preference";

export type { TutorialLanguage };
export type Localized = { en: string; vi: string; pl: string };

export const TUTORIAL_LANGUAGES: { id: TutorialLanguage; label: string; name: string }[] = [
  { id: "en", label: "EN", name: "English" },
  { id: "vi", label: "VI", name: "Tiếng Việt" },
  { id: "pl", label: "PL", name: "Polski" },
];

export function tr(lang: TutorialLanguage, text: Localized): string {
  return text[lang] || text.en;
}

/** Fill {name} placeholders. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

export type TutorialChapterId = "setup" | "first-round" | "battle" | "exploring" | "town" | "growing" | "war" | "victory";

/** The eight chapters of Sandro's apprenticeship, each with its medal. */
export const TUTORIAL_CHAPTERS: { id: TutorialChapterId; medal: string; name: Localized }[] = [
  { id: "setup", medal: "/assets/tutorial/medal-1.webp", name: { en: "Setting up", vi: "Chuẩn bị", pl: "Przygotowanie" } },
  { id: "first-round", medal: "/assets/tutorial/medal-2.webp", name: { en: "The first round", vi: "Vòng đầu tiên", pl: "Pierwsza runda" } },
  { id: "battle", medal: "/assets/tutorial/medal-3.webp", name: { en: "Your first battle", vi: "Trận đánh đầu tiên", pl: "Pierwsza bitwa" } },
  { id: "exploring", medal: "/assets/tutorial/medal-4.webp", name: { en: "Exploring", vi: "Khám phá", pl: "Eksploracja" } },
  { id: "town", medal: "/assets/tutorial/medal-5.webp", name: { en: "Your town", vi: "Thành của bạn", pl: "Twoje miasto" } },
  { id: "growing", medal: "/assets/tutorial/medal-6.webp", name: { en: "Growing stronger", vi: "Mạnh lên", pl: "Rozwój" } },
  { id: "war", medal: "/assets/tutorial/medal-7.webp", name: { en: "War", vi: "Chiến tranh", pl: "Wojna" } },
  { id: "victory", medal: "/assets/tutorial/medal-8.webp", name: { en: "Victory", vi: "Chiến thắng", pl: "Zwycięstwo" } },
];

export const UI = {
  coachLabel: { en: "Sandro's tutorial", vi: "Hướng dẫn của Sandro", pl: "Samouczek Sandra" },
  sandro: { en: "Sandro", vi: "Sandro", pl: "Sandro" },
  yourMove: { en: "Your move", vi: "Lượt của bạn", pl: "Twój ruch" },
  castleMoving: { en: "Castle is moving — watch the board.", vi: "Castle đang đi — hãy quan sát bàn cờ.", pl: "Zamek wykonuje ruch — obserwuj planszę." },
  gotIt: { en: "Got it", vi: "Đã hiểu", pl: "Rozumiem" },
  showLesson: { en: "Show lesson", vi: "Xem bài học", pl: "Pokaż lekcję" },
  watchHow: { en: "Watch how", vi: "Xem cách làm", pl: "Zobacz jak" },
  rulebook: { en: "Rule book p.{page}", vi: "Luật chơi tr.{page}", pl: "Instrukcja s.{page}" },
  round: { en: "Round {round}", vi: "Vòng {round}", pl: "Runda {round}" },
  progress: { en: "{percent}% of the game", vi: "{percent}% ván đấu", pl: "{percent}% gry" },
  startOver: { en: "Start over", vi: "Chơi lại từ đầu", pl: "Od nowa" },
  startOverConfirm: {
    en: "Start the tutorial over from the beginning?",
    vi: "Bắt đầu lại hướng dẫn từ đầu?",
    pl: "Zacząć samouczek od początku?",
  },
  exit: { en: "Exit (progress saved)", vi: "Thoát (đã lưu tiến độ)", pl: "Wyjdź (postęp zapisany)" },
  notYet: {
    en: "Not that move yet — follow my pointer, or press “Watch how”.",
    vi: "Chưa phải nước đó — hãy làm theo bàn tay chỉ, hoặc bấm “Xem cách làm”.",
    pl: "To jeszcze nie ten ruch — idź za moim wskaźnikiem albo kliknij „Zobacz jak”.",
  },
  offScript: {
    en: "{reason} The game goes on against the real computer — you are on your own from here.",
    vi: "{reason} Ván đấu tiếp tục với máy thật — từ đây bạn tự chơi.",
    pl: "{reason} Gra toczy się dalej przeciw prawdziwemu komputerowi — dalej radzisz sobie sam.",
  },
  missingPhone: { en: "(open the tab it lives on)", vi: "(mở thẻ chứa nó)", pl: "(otwórz kartę, na której się znajduje)" },
  missingDesktop: {
    en: "(it may be behind an open panel — close it first)",
    vi: "(có thể nó nằm sau một bảng đang mở — hãy đóng bảng đó trước)",
    pl: "(może być pod otwartym panelem — najpierw go zamknij)",
  },
  moveSide: { en: "Move to the other side", vi: "Chuyển sang bên kia", pl: "Przenieś na drugą stronę" },
  collapse: { en: "Collapse", vi: "Thu gọn", pl: "Zwiń" },
  expand: { en: "Expand", vi: "Mở rộng", pl: "Rozwiń" },
  language: { en: "Language", vi: "Ngôn ngữ", pl: "Język" },
  skipSetup: { en: "Set it up for me", vi: "Thiết lập giúp tôi", pl: "Ustaw za mnie" },
  learnSetup: { en: "Teach me the setup", vi: "Dạy tôi cách thiết lập", pl: "Naucz mnie ustawień" },
  chapterComplete: { en: "Chapter complete", vi: "Hoàn thành chương", pl: "Rozdział ukończony" },
  medals: { en: "{count} of 8 medals", vi: "{count}/8 huy chương", pl: "{count} z 8 medali" },
  certificateTitle: { en: "Certificate of Conquest", vi: "Chứng nhận Chinh phục", pl: "Certyfikat Podboju" },
  certificateBody: {
    en: "{name} has completed the apprenticeship of Sandro the Necromancer, conquering Castle in {rounds} rounds.",
    vi: "{name} đã hoàn thành khóa học của Pháp sư Sandro, chinh phục Castle trong {rounds} vòng.",
    pl: "{name} ukończył(a) terminowanie u nekromanty Sandra, zdobywając Zamek w {rounds} rund.",
  },
  createAccount: { en: "Create a free account to keep playing", vi: "Tạo tài khoản miễn phí để chơi tiếp", pl: "Załóż darmowe konto, aby grać dalej" },
  playScenario: { en: "Play a free game vs the computer", vi: "Chơi một ván tự do với máy", pl: "Zagraj swobodnie z komputerem" },
  backToMenu: { en: "Back to the menu", vi: "Về menu", pl: "Wróć do menu" },
  close: { en: "Close", vi: "Đóng", pl: "Zamknij" },
  replay: { en: "Replay", vi: "Phát lại", pl: "Powtórz" },
  howTo: { en: "How to", vi: "Cách làm", pl: "Jak to zrobić" },
  entryEyebrow: { en: "New to the game?", vi: "Mới chơi lần đầu?", pl: "Nowy w grze?" },
  entryTitle: { en: "Learn by playing with Sandro", vi: "Học bằng cách chơi cùng Sandro", pl: "Ucz się, grając z Sandrem" },
  entryBody: {
    en: "One full guided game — Necropolis against a Castle computer. Sandro shows every move before you make it: the map, battles, your town, cards, spells and levels, all the way to conquest.",
    vi: "Một ván đấu có hướng dẫn trọn vẹn — Necropolis đấu máy cầm Castle. Sandro chỉ cho ngươi từng nước đi trước khi làm: bản đồ, chiến đấu, thành, bài, phép và lên cấp, cho tới khi chinh phục.",
    pl: "Jedna pełna partia z przewodnikiem — Nekropolia przeciw komputerowi grającemu Zamkiem. Sandro pokazuje każdy ruch, zanim go wykonasz: mapę, bitwy, miasto, karty, czary i poziomy — aż do podboju.",
  },
  entryNoAccount: { en: "No account needed · about 30–45 minutes · leave and resume any time", vi: "Không cần tài khoản · khoảng 30–45 phút · thoát và chơi tiếp bất cứ lúc nào", pl: "Bez konta · ok. 30–45 minut · przerwij i wróć, kiedy chcesz" },
  entryPlay: { en: "Play the tutorial", vi: "Chơi hướng dẫn", pl: "Zagraj w samouczek" },
  entryContinue: { en: "Continue the tutorial", vi: "Tiếp tục hướng dẫn", pl: "Kontynuuj samouczek" },
  entryLater: { en: "Not now", vi: "Để sau", pl: "Nie teraz" },
  entryDontAsk: { en: "Don't ask again", vi: "Đừng hỏi lại", pl: "Nie pytaj ponownie" },
  entryResume: {
    en: "You can leave any time and pick up where you stopped from the Tutorial icon at the top of the menu.",
    vi: "Ngươi có thể thoát bất cứ lúc nào và chơi tiếp từ biểu tượng Tutorial ở đầu menu.",
    pl: "Możesz wyjść w każdej chwili i wrócić przez ikonę Tutorial u góry menu.",
  },
} satisfies Record<string, Localized>;
