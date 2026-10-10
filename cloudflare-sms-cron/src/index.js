const HEMS_SMS_WORKER_URL = 'https://hems-gamma.vercel.app/api/sms/worker';

export default {
  async fetch() {
    return new Response('HEMS SMS scheduler is running. Scheduled runs execute once per minute.', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  },

  async scheduled(_controller, env) {
    if (!env.CRON_SECRET) {
      throw new Error('Missing Cloudflare Worker secret: CRON_SECRET');
    }

    const response = await fetch(HEMS_SMS_WORKER_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${env.CRON_SECRET}`,
        Accept: 'application/json',
      },
    });

    const result = await response.text();
    if (!response.ok) {
      console.error(`HEMS SMS worker returned HTTP ${response.status}: ${result.slice(0, 500)}`);
      throw new Error(`HEMS SMS worker failed with HTTP ${response.status}`);
    }

    console.log(`HEMS SMS worker completed: ${result.slice(0, 500)}`);
  },
};
