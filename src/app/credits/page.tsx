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
          Card scans and hero board scans come from the community wiki/database; the classic hero
          portraits come from the Heroes 3 wiki at heroes.thelazy.net (Hero portraits page). Both are
          hosted locally for development reference in this non-profit fan prototype. Some town-building
          and icon imagery is still loaded by remote URL.
        </p>
        <p>
          The combat board terrain texture is original generated project art created for this prototype.
        </p>
        <p>
          The adventure-map tile images under <code>/assets/board/tiles</code> are rescaled from a
          community-made high-resolution remake of the printed map tiles (shared via the game&apos;s
          Tabletop Simulator community). Tile contents, guard difficulties and field effects were
          cross-checked against the fan wiki tile pages and the community rulebook before integration.
        </p>
        <p>
          The face-down tile backs under <code>/assets/board/backs</code> (Ⅰ, Ⅱ–Ⅲ, Ⅳ–Ⅴ, Ⅵ–Ⅶ) are
          extracted from the official rulebook PDF&apos;s &quot;Types of Map Tiles&quot; figure; the sea
          and underworld backs are drawn onto the same starfield after photos of the expansion tiles.
          The printed card backs under <code>/assets/card_back-*</code> (Might &amp; Magic, Astrologers,
          neutral units) come from the community rulebook rewrite&apos;s scanned assets
          (github.com/Heegu-sama/Homm3BG). The morale state icons under{" "}
          <code>/assets/icons/morale-*</code> are cropped from the classic Luck / Morale sprite sheet on
          The Spriters Resource (Heroes of Might and Magic 3, ripped by Cyrus Annihilator).
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
            <a href="https://en.homm3bg.wiki/tiles/">Wiki tiles reference (all map tiles and fields)</a>
          </li>
          <li>
            <a href="https://github.com/qwrtln/Homm3BG-build-artifacts">Community rulebook rewrite (map locations appendix)</a>
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
            <a href="https://en.homm3bg.wiki/artifacts/breastplate_of_petrified_wood/">
              Breastplate of Petrified Wood card reference
            </a>
          </li>
          <li>
            <a href="https://en.homm3bg.wiki/keywords/">Wiki keywords reference (Search, Dice, Remove)</a>
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
          <li>
            <a href="https://heroes.thelazy.net/index.php/Hero_portraits">
              Classic hero portraits (heroes.thelazy.net)
            </a>
          </li>
          <li>
            <a href="https://en.homm3bg.wiki/heroes/">Wiki heroes reference (boards and specialties)</a>
          </li>
          <li>
            <a href="https://www.spriters-resource.com/pc_computer/heroes3/sheet/41284/">
              Luck / Morale sprite sheet (The Spriters Resource, ripped by Cyrus Annihilator)
            </a>
          </li>
          <li>
            <a href="https://github.com/Heegu-sama/Homm3BG">
              Community rulebook rewrite assets (printed card backs)
            </a>
          </li>
        </ul>
      </section>
    </main>
  );
}
