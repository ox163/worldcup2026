export default async () => {
  const apiKey = Netlify.env.get("ODDS_API_KEY");

  if (!apiKey) {
    return Response.json(
      {
        status: "not_configured",
        message: "ODDS_API_KEY is not configured",
        sports: []
      },
      { status: 200 }
    );
  }

  const response = await fetch(
    `https://api.the-odds-api.com/v4/sports/?apiKey=${encodeURIComponent(apiKey)}&all=true`
  );
  const sports = await response.json();

  return Response.json(
    {
      status: response.ok ? "available" : "provider_error",
      sports: Array.isArray(sports)
        ? sports.filter((sport) => sport.group === "Soccer")
        : [],
      providerStatus: response.status
    },
    {
      status: 200,
      headers: {
        "Netlify-CDN-Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400"
      }
    }
  );
};

export const config = {
  path: "/api/odds-sports"
};
