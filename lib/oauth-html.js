// #1059: standalone success page shown after an OAuth callback.
export const OK_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>dsh-subscriptions - connected</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
             background: #0d1117; color: #c9d1d9; display: flex; align-items: center;
             justify-content: center; height: 100vh; margin: 0; }
      .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px;
              padding: 24px 32px; text-align: center; max-width: 360px; }
      h1 { font-size: 18px; margin: 0 0 8px; color: #58a6ff; }
      p { font-size: 13px; line-height: 1.5; margin: 0 0 16px; color: #8b949e; }
      .btn { display: inline-block; background: #238636; color: #fff; padding: 6px 14px;
             border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 500; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Account connected</h1>
      <p>Authentication token was saved. You can close this tab and return to DeepSeek Harness.</p>
      <a class="btn" href="javascript:window.close()">Close window</a>
    </div>
  </body>
</html>`
