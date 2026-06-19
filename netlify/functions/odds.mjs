function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(fc|cf|sc|afc|national|team)\b/g, "")
    .trim();
}

function minutesBetween(firstDate, secondDate) {
  return Math.abs(new Date(firstDate) - new Date(secondDate)) / 60000;
}

function oddsApiDate(date) {
  return new Date(date).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function namesMatch(firstName, secondName) {
  const first = normalize(firstName);
  const second = normalize(secondName);

  return first === second || first.includes(second) || second.includes(first);
}

function matchOddsEvent(match, event) {
  const timeClose = minutesBetween(match.utcDate, event.commence_time) <= 120;
  const sameDirection =
    namesMatch(match.homeTeam?.name, event.home_team) &&
    namesMatch(match.awayTeam?.name, event.away_team);
  const reversed =
    namesMatch(match.homeTeam?.name, event.away_team) &&
    namesMatch(match.awayTeam?.name, event.home_team);

  return timeClose && (sameDirection || reversed);
}

function getOutcomePrice(market, teamName) {
  return market?.outcomes?.find((outcome) => namesMatch(outcome.name, teamName))?.price ?? null;
}

function simplifyOdds(match, event) {
  const bookmakers = (event.bookmakers || [])
    .map((bookmaker) => {
      const market = bookmaker.markets?.find((item) => item.key === "h2h");

      if (!market) return null;

      const draw = market.outcomes?.find((outcome) => normalize(outcome.name) === "draw")?.price ?? null;

      return {
        key: bookmaker.key,
        name: bookmaker.title,
        lastUpdate: bookmaker.last_update,
        odds: {
          home: getOutcomePrice(market, match.homeTeam?.name),
          draw,
          away: getOutcomePrice(market, match.awayTeam?.name)
        }
      };
    })
    .filter((bookmaker) =>
      bookmaker &&
      bookmaker.odds.home !== null &&
      bookmaker.odds.away !== null
    )
    .slice(0, 6);

  return {
    status: bookmakers.length ? "available" : "not_found",
    provider: "The Odds API",
    market: "h2h",
    eventId: event.id,
    commenceTime: event.commence_time,
    bookmakers,
    disclaimer: "赔率仅供赛事信息参考，不构成投注建议。"
  };
}

async function getFootballDataMatch(matchId, footballApiKey) {
  const response = await fetch(
    "https://api.football-data.org/v4/competitions/WC/matches",
    {
      headers: {
        "X-Auth-Token": footballApiKey
      }
    }
  );
  const data = await response.json();
  return data.matches?.find((match) => String(match.id) === String(matchId));
}

export default async (request) => {
  const url = new URL(request.url);
  const matchId = url.searchParams.get("matchId");
  const oddsApiKey = Netlify.env.get("ODDS_API_KEY");
  const footballApiKey = Netlify.env.get("FOOTBALL_API_KEY");
  const sportKey = Netlify.env.get("ODDS_SPORT_KEY") || "soccer_fifa_world_cup";
  const regions = Netlify.env.get("ODDS_REGIONS") || "eu";
  const markets = Netlify.env.get("ODDS_MARKETS") || "h2h";

  if (!matchId) {
    return Response.json(
      { status: "bad_request", message: "matchId is required" },
      { status: 400 }
    );
  }

  if (!oddsApiKey) {
    return Response.json({
      status: "not_configured",
      message: "ODDS_API_KEY is not configured",
      disclaimer: "赔率仅供赛事信息参考，不构成投注建议。"
    });
  }

  if (!footballApiKey) {
    return Response.json({
      status: "not_configured",
      message: "FOOTBALL_API_KEY is not configured",
      disclaimer: "赔率仅供赛事信息参考，不构成投注建议。"
    });
  }

  const match = await getFootballDataMatch(matchId, footballApiKey);

  if (!match) {
    return Response.json({ status: "not_found", message: "Match not found" });
  }

  const oddsUrl = new URL(`https://api.the-odds-api.com/v4/sports/${sportKey}/odds/`);
  oddsUrl.searchParams.set("apiKey", oddsApiKey);
  oddsUrl.searchParams.set("regions", regions);
  oddsUrl.searchParams.set("markets", markets);
  oddsUrl.searchParams.set("oddsFormat", "decimal");
  oddsUrl.searchParams.set("dateFormat", "iso");
  oddsUrl.searchParams.set("commenceTimeFrom", oddsApiDate(Date.parse(match.utcDate) - 2 * 60 * 60 * 1000));
  oddsUrl.searchParams.set("commenceTimeTo", oddsApiDate(Date.parse(match.utcDate) + 2 * 60 * 60 * 1000));

  const response = await fetch(oddsUrl);
  const oddsEvents = await response.json();

  if (!response.ok || !Array.isArray(oddsEvents)) {
    return Response.json({
      status: "provider_error",
      providerStatus: response.status,
      message: oddsEvents?.message || "Odds provider error",
      disclaimer: "赔率仅供赛事信息参考，不构成投注建议。"
    });
  }

  const event = oddsEvents.find((candidate) => matchOddsEvent(match, candidate));

  if (!event) {
    return Response.json({
      status: "not_found",
      message: "No odds matched this fixture",
      disclaimer: "赔率仅供赛事信息参考，不构成投注建议。"
    });
  }

  return Response.json(simplifyOdds(match, event), {
    headers: {
      "Netlify-CDN-Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800"
    }
  });
};

export const config = {
  path: "/api/odds"
};
