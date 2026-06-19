export default async function handler(req, res) {
  const r = await fetch("https://api.football-data.org/v4/competitions/WC/matches", {
    headers: {
      "X-Auth-Token": process.env.FOOTBALL_API_KEY
    }
  });

  const data = await r.json();
  res.status(200).json(data);
}
