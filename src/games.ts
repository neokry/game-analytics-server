export type GameConfig = {
  slug: string;
  name: string;
  active: boolean;
  allowedOrigins: string[];
  publicWriteKey?: string;
};

const itchOrigins = ["https://neokry.itch.io", "https://*.itch.zone"];

export const games: GameConfig[] = [
  {
    slug: "dead-letters",
    name: "Dead Letters",
    active: true,
    allowedOrigins: [
      ...itchOrigins,
      "http://localhost:5123",
      "http://127.0.0.1:5123",
      "http://localhost:5124",
      "http://127.0.0.1:5124"
    ]
  },
  {
    slug: "custody",
    name: "Custody",
    active: true,
    allowedOrigins: [
      ...itchOrigins,
      "http://localhost:5123",
      "http://127.0.0.1:5123",
      "http://localhost:5124",
      "http://127.0.0.1:5124"
    ]
  },
  {
    slug: "where-is-starlingdive",
    name: "Where Is Starlingdive?",
    active: true,
    allowedOrigins: [
      ...itchOrigins,
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "http://localhost:4173",
      "http://127.0.0.1:4173"
    ]
  }
];

export function findGame(slug: string): GameConfig | undefined {
  return games.find((game) => game.slug === slug);
}
