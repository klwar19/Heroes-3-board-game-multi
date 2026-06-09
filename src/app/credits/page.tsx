export default function CreditsPage() {
  return (
    <main className="creditsPage">
      <section className="panel creditsPanel">
        <h1>Credits</h1>
        <p>
          This is a non-profit fan multiplayer tool for Heroes of Might and Magic III: The Board Game.
          Heroes of Might and Magic III and related artwork/rules belong to their respective owners and
          Archon Studio. This app is not affiliated with or endorsed by Ubisoft, The 3DO Company, New
          World Computing, or Archon Studio unless separately stated.
        </p>
        <p>
          Card and unit images are loaded from the community wiki/database by remote URL for development
          reference. They are not copied into this repository.
        </p>
      </section>

      <section className="panel creditsPanel">
        <h2>Research Sources</h2>
        <ul className="sourceList">
          <li>
            <a href="https://archon-studio.com/files/manuals/homm/homm-rulebook_EN.pdf">Official rulebook PDF</a>
          </li>
          <li>
            <a href="https://en.homm3bg.wiki/">Heroes 3 Board Game fan wiki/database</a>
          </li>
          <li>
            <a href="https://en.homm3bg.wiki/units/">Wiki units reference</a>
          </li>
          <li>
            <a href="https://en.homm3bg.wiki/keywords/combat/">Wiki combat keyword reference</a>
          </li>
          <li>
            <a href="https://en.homm3bg.wiki/spells/magic_arrow/">Magic Arrow card reference</a>
          </li>
          <li>
            <a href="https://en.homm3bg.wiki/abilities/resistance/">Resistance card reference</a>
          </li>
          <li>
            <a href="https://en.homm3bg.wiki/units/elves/">Elves unit reference</a>
          </li>
          <li>
            <a href="https://en.homm3bg.wiki/units/griffins/">Griffins unit reference</a>
          </li>
          <li>
            <a href="https://en.homm3bg.wiki/units/pit_lords/">Pit Lords unit reference</a>
          </li>
          <li>
            <a href="https://en.homm3bg.wiki/units/magogs/">Magogs unit reference</a>
          </li>
          <li>
            <a href="https://mightandmagic.fandom.com/wiki/Heroes_of_Might_and_Magic_III%3A_The_Board_Game">
              Might and Magic Fandom overview
            </a>
          </li>
        </ul>
      </section>
    </main>
  );
}
