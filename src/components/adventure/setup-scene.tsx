"use client";

const FRUIT = [
  { id: "mode", className: "setupSceneFruit--mode" },
  { id: "heroes", className: "setupSceneFruit--heroes" },
  { id: "map", className: "setupSceneFruit--map" },
  { id: "advanced", className: "setupSceneFruit--advanced" }
] as const;

export function SetupSceneArt() {
  return (
    <div aria-hidden="true" className="setupSceneArt" data-testid="setup-scene-art">
      <span className="setupSceneIllustration" />
      {FRUIT.map((fruit) => (
        <span className={`setupScenePaintedFruit ${fruit.className}`} key={fruit.id} />
      ))}

      <span className="setupSceneDragonBreath" />
    </div>
  );
}
