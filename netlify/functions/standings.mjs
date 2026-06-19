export default async () => {
  const apiKey = Netlify.env.get("FOOTBALL_API_KEY");

  if (!apiKey) {
    return Response.json(
      { error: "FOOTBALL_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const response = await fetch(
    "https://api.football-data.org/v4/competitions/WC/standings",
    {
      headers: {
        "X-Auth-Token": apiKey
      }
    }
  );

  const data = await response.json();
  return Response.json(data, { status: response.status });
};

export const config = {
  path: "/api/standings"
};
