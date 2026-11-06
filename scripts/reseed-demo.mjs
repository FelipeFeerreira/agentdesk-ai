// Triggers the scheduled reseed of the public demo.
//
//   DEMO_RESEED_URL="https://your-demo.vercel.app/api/demo/reseed" \
//   DEMO_RESEED_SECRET="same value as the deployment env" \
//   node scripts/reseed-demo.mjs
//
// Point a free cron (cron-job.org, GitHub Actions on `schedule`, or Vercel Cron
// on a paid plan) at this script every 6 hours. On the Vercel free plan the
// built-in cron runs once a day only, which is why the external trigger exists.

const url = process.env.DEMO_RESEED_URL;
const secret = process.env.DEMO_RESEED_SECRET;

if (!url || !secret) {
  console.error("DEMO_RESEED_URL and DEMO_RESEED_SECRET are required.");
  process.exit(1);
}

const response = await fetch(url, {
  method: "POST",
  headers: { Authorization: `Bearer ${secret}` },
});

const body = await response.text();
console.log(response.status, body);

if (!response.ok) process.exit(1);
