export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { email, userAnswers, ...anthropicBody } = body;

    // Call Anthropic
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(anthropicBody),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    // Send emails via Resend (non-blocking — failures here should not break the roadmap response)
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        const rawText = data.content?.find(b => b.type === 'text')?.text || '';
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        let plan = null;
        if (jsonMatch) {
          try { plan = JSON.parse(jsonMatch[0]); } catch(e) {}
        }

        const baseStyle = `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;color:#333;`;
        const blue = '#00aaff';
        const footer = `<p style="color:#999;font-size:12px;margin-top:32px;border-top:1px solid #eee;padding-top:16px;">Plan My Program · Powered by <strong>Clear Path Leadership</strong> · planmyprogram.com</p>`;

        const answersHtml = userAnswers ? `
          <h3 style="color:#666;font-size:13px;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:10px;">Their Answers</h3>
          <table style="width:100%;border-collapse:collapse;margin-bottom:28px;font-size:13px;">
            ${Object.entries(userAnswers).map(([k, v]) => `
              <tr>
                <td style="padding:5px 12px 5px 0;color:#888;vertical-align:top;white-space:nowrap;">${k}</td>
                <td style="padding:5px 0;color:#333;">${v}</td>
              </tr>
            `).join('')}
          </table>
        ` : '';

        let planHtml = '<p>Program plan generated.</p>';
        if (plan) {
          const themesHtml = (plan.training_themes || []).map(t =>
            `<div style="padding:14px 0;border-bottom:1px solid #eee;">
              <strong style="color:#111;font-size:16px;">${t.name}</strong>
              <p style="margin:6px 0 10px;color:#555;font-size:14px;">${t.why_it_matters}</p>
              ${(t.in_practice || []).map(p => `<p style="margin:4px 0;color:#666;font-size:13px;">→ ${p}</p>`).join('')}
              <p style="margin:10px 0 0;color:${blue};font-size:13px;font-style:italic;">${t.you_will_know}</p>
            </div>`
          ).join('');

          const pictureHtml = (plan.picture_this || []).map(p =>
            `<p style="margin:6px 0;color:#555;font-size:14px;">→ ${p}</p>`
          ).join('');

          planHtml = `
            <h2 style="font-size:20px;font-weight:700;margin-bottom:4px;">Your Customized Training Roadmap</h2>
            <p style="color:#888;font-size:13px;margin-bottom:24px;">Built from your answers. Designed to actually stick.</p>

            <h3 style="color:${blue};font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">The mindset shift your organization needs</h3>
            <p style="font-style:italic;color:#333;margin-bottom:6px;"><strong>From:</strong> ${plan.mindset_shift?.from}</p>
            <p style="font-style:italic;color:#333;margin-bottom:10px;"><strong>To:</strong> ${plan.mindset_shift?.to}</p>
            <p style="color:#555;font-size:14px;margin-bottom:24px;">${plan.mindset_shift?.why_it_matters}</p>

            <h3 style="color:${blue};font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">What your training should build</h3>
            <p style="color:#555;font-size:14px;margin-bottom:14px;">Based on what you shared, here are the threads worth weaving into your training rhythm. These aren't steps in a sequence — they work best together, reinforcing each other over time.</p>
            ${themesHtml}

            <h3 style="color:${blue};font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin:24px 0 10px;">Picture this</h3>
            <p style="color:#555;font-size:14px;margin-bottom:10px;">If these themes take root, here's what it might look like a year from now.</p>
            ${pictureHtml}

            <h3 style="color:${blue};font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin:24px 0 10px;">One honest observation</h3>
            <p style="font-style:italic;color:#333;border-left:3px solid ${blue};padding-left:14px;font-size:15px;">${plan.honest_word}</p>
          `;
        }

        // Notify Brady
        const notifyResp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resendKey}`,
          },
          body: JSON.stringify({
            from: 'Plan My Program <noreply@planmyprogram.com>',
            to: 'info@clearpathokc.com',
            subject: `New Plan My Program submission${email ? ' from ' + email : ''}`,
            html: `<div style="${baseStyle}">${answersHtml}${planHtml}${footer}</div>`,
          }),
        });
        if (!notifyResp.ok) {
          console.error('Resend notify email failed:', await notifyResp.text());
        }

        // Send plan to user
        if (email) {
          const userResp = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${resendKey}`,
            },
            body: JSON.stringify({
              from: 'Plan My Program <noreply@planmyprogram.com>',
              to: email,
              subject: 'Your leadership program plan is here',
              html: `<div style="${baseStyle}">
                <p style="color:#555;margin-bottom:24px;">Here's the program plan you built at <a href="https://planmyprogram.com" style="color:${blue};">planmyprogram.com</a>. Keep it somewhere safe — this is your starting point.</p>
                ${planHtml}
                <div style="background:#0c0f18;border-radius:12px;padding:32px;margin-top:32px;text-align:center;">
                  <p style="color:#f0f2f8;font-size:18px;font-weight:700;margin:0 0 10px;">Your plan is ready. Now let's build it together.</p>
                  <p style="color:#8892a4;font-size:14px;margin:0 0 20px;">Clear Path Leadership works with organizations as a fractional leadership development partner — not a one-time trainer, not a generic consultant. We help you build, run, and sustain a program that transforms your people.</p>
                  <a href="https://clearpathokc.com/contact" style="background:${blue};color:#0c0f18;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block;">Let's Talk →</a>
                </div>
                ${footer}
              </div>`,
            }),
          });
          if (!userResp.ok) {
            console.error('Resend user email failed:', await userResp.text());
          }
        }
      } catch (emailError) {
        // Log but do not fail the request — the roadmap was generated successfully
        console.error('Email sending failed:', emailError.message);
      }
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Handler error:', error);
    return res.status(500).json({ error: error.message || 'Unknown error', stack: error.stack });
  }
}
