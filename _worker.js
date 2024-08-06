(() => {
  // _worker.js
  addEventListener("fetch", (event) => {
    event.respondWith(handleRequest(event.request));
  });
  var KV = oai_global_variables;
  // const myWorkerURL = "oai.kylelv.com";
  function parseJwt(token) {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(atob(base64).split("").map(function(c) {
      return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(""));
    return JSON.parse(jsonPayload);
  }
  async function refreshAT(tochecktoken, an) {
    const accessTokenKey = `at_${an}`;
    const token = tochecktoken || await KV.get(accessTokenKey) || "";
    if (token && token !== "Bad_RT" && token !== "Old_AT") {
      const payload = parseJwt(token);
      const currentTime = Math.floor(Date.now() / 1e3);
      if (payload.exp > currentTime) {
        return token;
      }
    }
    const refreshTokenKey = `rt_${an}`;
    const url = "https://token.oaifree.com/api/auth/refresh";
    const refreshToken = await KV.get(refreshTokenKey);
    if (refreshToken) {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
        },
        body: `refresh_token=${refreshToken}`
      });
      if (response.ok) {
        const data = await response.json();
        const newAccessToken = data.access_token;
        await KV.put(accessTokenKey, newAccessToken);
        return newAccessToken;
      } else {
        await KV.put(accessTokenKey, "Bad_RT");
        return "";
      }
    } else {
      await KV.put(accessTokenKey, "Old_AT");
      return "";
    }
  }
  function generatePassword(token) {
    let hash = 7;
    for (let i = 0; i < token.length; i++) {
      const char = token.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    let hashStr = Math.abs(hash).toString();
    while (hashStr.length < 15) {
      hashStr = "7" + hashStr;
    }
    return hashStr.substring(0, 15);
  }
  async function verifyTurnstile(responseToken) {
    const removeTurnstile = "";//await KV.get("RemoveTurnstile") || "";
    if (removeTurnstile) {
      return "true";
    }
    const verifyUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
    const secretKey = await KV.get("TurnstileKeys");
    const response = await fetch(verifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: secretKey,
        response: responseToken
      })
    });
    const data = await response.json();
    return data.success;
  }
  async function usermatch(userName2, usertype) {
    const typeUsers = await KV.get(usertype) || "";
    const typeUsersArray = typeUsers.split(",");
    return typeUsersArray.includes(userName2);
  }
  async function checkContentForModeration(messages, apiKey) {
    const response = await fetch("https://api.oaipro.com/v1/moderations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ input: messages })
    });
    if (response.ok) {
      const data = await response.json();
      return {
        shouldBlock: data.results.some((result) => result.flagged)
      };
    } else {
      console.error("Moderation API returned an error:", response.status);
      return { shouldBlock: false };
    }
  }
  async function handleRequest(request) {
    const url = new URL(request.url);
    if (url.protocol !== "https:") {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }
    const voiceURL = "oaivoice.kylelv.com";//await KV.get("VoiceURL");
    const admin = await KV.get("Admin");
    // const chatlogourl = await KV.get("ChatLogoURL") || await KV.get("LogoURL") || logo;
    const chatlogourl = logo;
    let chatusername = "USER";
    const chatmail = "kylelv.com";
    // const apiKey = await KV.get("ModerationApiKey");
    const cookies = request.headers.get("Cookie");
    let aian = "";
    if (cookies) {
      const cookiesArray = cookies.split(";");
      for (const cookie of cookiesArray) {
        const [name, value] = cookie.trim().split("=");
        if (name === "aian") {
          aian = value;
        } else if (name === "username") {
          chatusername = value;
        }
      }
    }
    // const userName2 = params.get("un");
    // if (userName2) {
    //   const accountNumber = params.get("an-custom") || params.get("an") || "1";
    //   return await handleLogin(userName2, accountNumber, "do not need Turnstle", "");
    // }
    if (!admin) {
      return handleInitialRequest(request);
    }
    if (url.pathname.startsWith("/share")) {
      url.host = "chatgpt.com";
      return new Response(null, {
        status: 302,
        headers: {
          'Location': url.toString()
        }
      });
    }
    if (url.pathname.startsWith("/admin")) {
      if (request.method === "GET") {
        return handleAdminGetRequest();
      } else if (request.method === "POST") {
        return handleAdminPostRequest(request);
      } else {
        return new Response("Method not allowed", { status: 405 });
      }
    }
    if (url.pathname.startsWith("/token")) {
      if (request.method === "GET") {
        return handlePlusGetRequest();
      } else if (request.method === "POST") {
        return handlePlusPostRequest(request);
      } else {
        return new Response("Method not allowed", { status: 405 });
      }
    }
    // if (url.pathname.startsWith("/export")) {
    //   if (request.method === "GET") {
    //     return handleExportGetRequest(request);
    //   } else if (request.method === "POST") {
    //     return handleExportPostRequest(request);
    //   } else {
    //     return new Response("Method not allowed", { status: 405 });
    //   }
    // }
    if (url.pathname.startsWith("/user")) {
      if (request.method === "GET") {
        return handleUserGetRequest();
      } else if (request.method === "POST") {
        return handleUserPostRequest(request);
      } else {
        return new Response("Method not allowed", { status: 405 });
      }
    }
    if (url.pathname.startsWith("/register")) {
      if (request.method === "GET") {
        return new Response(await getRegisterHTML(), {
          headers: { "content-type": "text/html" }
        });
      } else if (request.method === "POST") {
        return handleRegisterPostRequest(request);
      } else {
        return new Response("Method not allowed", { status: 405 });
      }
    }
    if (url.pathname.startsWith("/usage")) {
      return handleUsageRequest(request);
    }
    if (url.pathname === "/auth/login_auth0") {
      if (request.method === "GET") {
        return handleLoginGetRequest(request);
      } else if (request.method === "POST") {
        return handleLoginPostRequest(request);
      } else {
        return new Response("Method not allowed", { status: 200 });
      }
    }
    if (url.pathname === "/auth/login") {
      // url.host = "new.oaifree.com";
      url.pathname = "/auth/login_auth0";
      url.protocol = "https";
      // return fetch(new Request(url, request));
      return new Response(null, {
        status: 302,
        headers: {
          'Location': url.toString()
        }
      });
    }
    // if (apiKey) {
    //   if (url.pathname === "/backend-api/conversation") {
    //     const requestBody = await request.json();
    //     const userMessages = requestBody.messages.filter(
    //       (msg) => msg.author.role === "user" && msg.content.content_type === "text"
    //     ).map((msg) => msg.content.parts.join(" "));
    //     if (userMessages.length > 0) {
    //       const moderationResult = await checkContentForModeration(
    //         userMessages,
    //         apiKey
    //       );
    //       if (moderationResult.shouldBlock) {
    //         const UserName = userMessages;
    //         await deletelog(UserName, aian, "Message");
    //         return new Response(
    //           JSON.stringify({ detail: "\u6B64\u5185\u5BB9\u53EF\u80FD\u8FDD\u53CD\u4E86\u6211\u4EEC\u7684\u4F7F\u7528\u653F\u7B56" }),
    //           {
    //             status: 451,
    //             headers: { "Content-Type": "application/json" }
    //           }
    //         );
    //       }
    //     }
    //     url.host = "new.oaifree.com";
    //     const newnewRequest = new Request(url, {
    //       body: JSON.stringify(requestBody),
    //       method: request.method,
    //       headers: request.headers
    //     });
    //     return fetch(newnewRequest);
    //   }
    // }
    if (url.pathname === "/switch_account") {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 });
      }
      
      const data = await request.formData();
      const newAccount = data.get('an');
      const currentAccount = request.headers.get('Cookie').split(';')
      .find(c => c.trim().startsWith('username='))
      ?.split('=')[1];
      
      try {
        // 示例：更新用户的当前账号
        return await handleLogin(currentAccount, newAccount, "do not need Turnstle", false);

      } catch (error) {
        return new Response('Internal Server Error', { status: 500 });
      }
    }


    url.host = "new.oaifree.com";
    const modifiedRequest = new Request(url, request);
    if (voiceURL) {
      modifiedRequest.headers.set("X-Voice-Base", `https://${voiceURL}`);
    }
    const response = await fetch(modifiedRequest);
    if (url.pathname === "/backend-api/conversations") {
      const data = await response.json();
      data.items = data.items.filter((item) => item.title !== "\u{1F512}");
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: response.headers
      });
    }
    if (url.pathname === "/backend-api/me") {
      const data = await response.json();
      data.picture = `${chatlogourl}`;
      data.email = `${chatmail}`;
      data.name = `${chatusername} [${aian}]`;
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: response.headers
      });
    }
    if (url.pathname === "/backend-api/gizmo_creator_profile") {
      const data = await response.json();
      data.name = `${chatusername} [${aian}]`;
      data.display_name = `${chatusername} [${aian}]`;
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: response.headers
      });
    }
    if (url.pathname === "/backend-api/accounts/check") {
      const data = await response.json();
      for (const accountId in data.accounts) {
        if (data.accounts[accountId].account) {
          data.accounts[accountId].account.name = `${chatusername} [${aian}]`;
        }
      }
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: response.headers
      });
    }

    let contentType = response.headers.get('content-type')

    if (contentType && contentType.includes('text/html') && response.status === 200) {
        let html = await response.text()
        html = await injectFloatingBall(html)
        return new Response(html, {
            headers: { 'content-type': 'text/html' }
        })
    }
    
    return response;
  }
  
  async function injectFloatingBall(html) {
      const aliveAccountOptions = await getAliveAccountOptions();
      const floatingBallHTML = `
          <div class="floating-ball-container">
              <div class="floating-ball" onclick="toggleMenu()">换号</div>
              <div id="menu" class="menu">
                  <div class="input-wrapper">
                      <select id="an" name="an" class="choose-account">
                          <option value="" selected disabled hidden>Select Account</option>
                          ${aliveAccountOptions}
                      </select>
                  </div>
                  <button class="continue-btn" onclick="submitAccount()">切换</button>
                  <form id="switchAccountForm" method="POST" action="/switch_account" style="display: none;">
                      <input type="hidden" id="switchAccountInput" name="an">
                  </form>
              </div>
          </div>
          <style>
              @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500&display=swap');
  
              .floating-ball-container {
                  position: fixed;
                  top: 25%;
                  right: 20px;
                  transform: translateY(-50%);
                  z-index: 1000;
                  cursor: move;
              }
  
              .floating-ball {
                  width: 40px;
                  height: 40px;
                  background-color: var(--main-surface-secondary);
                  color: var(--text-secondary);
                  border-radius: 50%;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  font-size: 15px; 
                  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
                  transition: right 0.3s;
              }
  
              .menu {
                  display: none;
                  position: absolute;
                  top: 50%;
                  right: 60px;
                  transform: translateY(-50%);
                  background-color: var(--main-surface-secondary);;
                  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
                  border-radius: 8px;
                  overflow: hidden;
                  z-index: 1001;
                  width: 180px;
              }
  
              .menu .input-wrapper {
                  padding: 10px;
                  background-color: var(--main-surface-secondary);;
              }
  
              .menu .choose-account {
                  width: 100%;
                  padding: 10px;
                  background-color: var(--main-surface-secondary);
                  color: var(--text-secondary);
                  margin-bottom: 10px;
                  border: 1px solid #c2c8d0;
                  border-radius: 6px;
                  font-size: 16px;
              }
  
              .menu .continue-btn {
                  width: 100%;
                  padding: 10px;
                  background-color: var(--main-surface-secondary);
                  color: var(--text-secondary);
                  border: none;
                  border-radius: 6px;
                  cursor: pointer;
                  font-size: 16px;
              }
  
              .menu .continue-btn:hover {
                  background-color: var(--main-surface-secondary);
              }
          </style>
          <script>
              function toggleMenu() {
                  var menu = document.getElementById('menu');
                  if (menu.style.display === 'none' || menu.style.display === '') {
                      menu.style.display = 'block';
                  } else {
                      menu.style.display = 'none';
                  }
              }
  
              document.addEventListener('click', function(event) {
                  var menu = document.getElementById('menu');
                  var ball = document.querySelector('.floating-ball');
                  if (!menu.contains(event.target) && !ball.contains(event.target)) {
                      menu.style.display = 'none';
                  }
              });
  
              function submitAccount() {
                  var account = document.getElementById('an').value;
                  if (account) {
                      var form = document.getElementById('switchAccountForm');
                      var input = document.getElementById('switchAccountInput');
                      input.value = account;
                      form.submit();
                  } else {
                      alert('Please select an account');
                  }
              }
  
              function makeDraggable(element) {
                  let isDragging = false;
                  let startY, initialY;
                  const maxHeight = window.innerHeight * 0.9;
                  const minHeight = window.innerHeight * 0.1;
  
                  element.addEventListener('mousedown', startDrag);
                  element.addEventListener('mouseup', stopDrag);
                  element.addEventListener('mousemove', preventDrag);
  
                  function startDrag(e) {
                      // Ignore drag start if the event target is an input or select element
                      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON') {
                          return;
                      }
                      isDragging = true;
                      startY = e.clientY;
                      initialY = element.offsetTop;
                      document.addEventListener('mousemove', drag);
                      document.addEventListener('mouseup', stopDrag);
                  }
  
                  function drag(e) {
                      if (isDragging) {
                          const dy = e.clientY - startY;
                          let newTop = initialY + dy;
  
                          // Constrain the movement within 10% to 90% of the viewport height
                          if (newTop < minHeight) {
                              newTop = minHeight;
                          } else if (newTop > maxHeight) {
                              newTop = maxHeight;
                          }
  
                          element.style.top = newTop + 'px';
                          element.style.right = '20px'; // Keep it on the right side
                          element.style.left = 'auto';  // Ensure it stays on the right side
                      }
                  }
  
                  function stopDrag() {
                      isDragging = false;
                      document.removeEventListener('mousemove', drag);
                      document.removeEventListener('mouseup', stopDrag);
                  }
  
                  function preventDrag(e) {
                      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON') {
                          isDragging = false;
                      }
                  }
              }
  
              document.addEventListener('DOMContentLoaded', function() {
                  const floatingBallContainer = document.querySelector('.floating-ball-container');
                  makeDraggable(floatingBallContainer);
              });
  
              window.toggleMenu = toggleMenu;
              window.submitAccount = submitAccount;
          </script>
      `;
  
      return html.replace('</body>', `${floatingBallHTML}</body>`);
  }
  
  
  
  
  



  async function handleInitialRequest(request) {
    const admin = await KV.get("Admin");
    if (!admin) {
      if (request.method === "GET") {
        return handleInitialGetRequest();
      } else if (request.method === "POST") {
        return handleInitialPostRequest(request);
      } else {
        return new Response("Method not allowed", { status: 405 });
      }
    } else {
      return new Response("Already Have Admin", { status: 405 });
    }
  }
  async function handleInitialPostRequest(request) {
    const formData = await request.formData();
    const fields = [
      "TurnstileKeys",
      "TurnstileSiteKey",
      "Users",
      "VIPUsers",
      "FreeUsers",
      "Admin",
      "ForceAN",
      "SetAN",
      "PlusMode",
      "FreeMode",
      "WebName",
      "WorkerURL",
      "VoiceURL",
      "LogoURL",
      "CDKEY",
      "AutoDeleteCDK",
      "FKDomain",
      "Status",
      "PlusAliveAccounts",
      "FreeAliveAccounts",
      "rt_1",
      "rt_2",
      "at_1",
      "at_2",
      "FreeURL",
      "ChatUserName",
      "ChatMail",
      "ChatLogoURL",
      "RemoveTurnstile",
      "ModerationApiKey"
    ];
    for (const field of fields) {
      let value = formData.get(field);
      if (value) {
        if (field === "WorkerURL" && !value) {
          value = new URL(request.url).hostname;
        }
        if (field === "VoiceURL" && !value) {
          let hostname = new URL(request.url).hostname;
          let parts = hostname.split(".");
          parts[0] = "voice";
          value = parts.join(".");
        }
        if (field === "FreeURL" && !value) {
          let hostname = new URL(request.url).hostname;
          let parts = hostname.split(".");
          parts[0] = "free";
          value = parts.join(".");
        }
        await KV.put(field, value);
      }
    }
    return new Response("Parameters updated successfully", { status: 200 });
  }
  async function handleInitialGetRequest() {
    const html = await getInitialHTML();
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  }
  async function getInitialHTML() {
    return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Variable Shortcut Entry</title>
    <style>
      body {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        background-color: #f2f2f5;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        margin: 0;
        overflow: hidden;
      }
      .container {
        background-color: #ffffff;
        padding: 20px;
        border-radius: 12px;
        box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
        max-width: 600px;
        width: 100%;
        height: 90vh;
        overflow-y: auto;
        box-sizing: border-box;
      }
      .container h1 {
        margin-bottom: 24px;
        font-size: 28px;
        color: #333;
        font-weight: 600;
      }
      .container label {
        display: block;
        font-size: 16px;
        margin-bottom: 8px;
        color: #555;
        text-align: left;
      }
      .container input {
        padding: 12px;
        border: 1px solid #ddd;
        border-radius: 8px;
        font-size: 16px;
        box-sizing: border-box;
        width: 100%;
        margin-bottom: 20px;
      }
      .container button {
        background-color: #007aff;
        border: none;
        color: white;
        font-size: 18px;
        cursor: pointer;
        transition: background-color 0.3s;
        padding: 12px;
        border-radius: 8px;
        width: 100%;
      }
      .container button:hover {
        background-color: #005fcb;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Variable Shortcut Entry</h1>
      <form id="variableEntryForm" action="/" method="POST">
        ${getInitialFieldsHTML()}
        <button type="submit">Submit</button>
      </form>
    </div>
  </body>
  </html>
`;
  }
  function getInitialFieldsHTML() {
    const fields = [
      { name: "Admin", label: "\u3010\u5FC5\u586B\u3011\u7BA1\u7406\u5458 (\u7528\u4E8E\u7BA1\u7406\u9762\u677F\u7684\u9A8C\u8BC1\u4F7F\u7528\uFF0C\u4E14\u53EF\u770B\u6240\u6709\u804A\u5929\u8BB0\u5F55)", isrequired: "required" },
      { name: "TurnstileKeys", label: "\u3010\u5FC5\u586B\u3011Turnstile\u5BC6\u94A5", isrequired: "required" },
      { name: "TurnstileSiteKey", label: "\u3010\u5FC5\u586B\u3011Turnstile\u7AD9\u70B9\u5BC6\u94A5", isrequired: "required" },
      { name: "Remove Turnstile", label: "\u3010\u9009\u586B\u3011\u6709\u503C\u5219\u7981\u7528Turnstile\u9A8C\u8BC1\uFF0C\u4EE5\u4E0A\u4E24\u4E2A\u53C2\u6570\u968F\u610F" },
      { name: "ModerationApiKey", label: "\u3010\u9009\u586B\u3011\u5982\u9700\u542F\u7528\u9053\u5FB7\u5BA1\u67E5\uFF0C\u5219\u586B\u5165\u59CB\u7687oaipro\u7684apikey" },
      { name: "WorkerURL", label: "\u7AD9\u70B9\u57DF\u540D (\u65E0\u9700https://\u3010\u9009\u586B\uFF0C\u4E0D\u586B\u5219\u81EA\u52A8\u50A8\u5B58worker\u7684\u57DF\u540D\u3011" },
      { name: "VoiceURL", label: "voice\u670D\u52A1\u57DF\u540D (\u65E0\u9700https://\u3010\u9009\u586B\uFF0C\u4E0D\u586B\u5219\u81EA\u52A8\u50A8\u5B58worker\u7684\u57DF\u540D\u3011" },
      { name: "FreeURL", label: "Free\u9009\u8F66\u9762\u677F\u57DF\u540D (\u65E0\u9700https://\u3010\u9009\u586B\uFF0C\u4E0D\u586B\u5219\u81EA\u52A8\u50A8\u5B58worker\u7684\u57DF\u540D\u3011" },
      { name: "WebName", label: "\u7AD9\u70B9\u540D\u79F0" },
      { name: "LogoURL", label: "Logo\u56FE\u7247\u5730\u5740 (\u9700https://)" },
      { name: "ChatLogoURL", label: "chat\u754C\u9762\u7528\u6237\u5934\u50CF\u5730\u5740(\u9700https://)" },
      { name: "ChatUserName", label: "chat\u754C\u9762\u7528\u6237\u540D (\u9700https://)" },
      { name: "ChatMail", label: "chat\u754C\u9762\u7528\u6237\u90AE\u7BB1 (\u9700https://)" },
      { name: "Users", label: "\u9ED8\u8BA4\u7528\u6237 (\u4EE5aaa,bbb,ccc\u5F62\u5F0F\u586B\u5199)" },
      { name: "VIPUsers", label: "VIP\u7528\u6237 (\u5373\u79C1\u8F66\u7528\u6237\uFF0C\u65E0\u901F\u7387\u548C\u65F6\u95F4\u9650\u5236)" },
      { name: "FreeUsers", label: "\u514D\u8D39\u7528\u6237 (\u6709\u901F\u7387\u548C\u65F6\u95F4\u9650\u5236)" },
      { name: "ForceAN", label: "\u5F3A\u5236\u4E0A\u8F66 (\u82E5\u8BBE\u7F6E\u4E3A1\uFF0C\u7528\u6237\u540D\u4E3Axxx_n\u7684\u79C1\u8F66\u7528\u6237\u7528\u767B\u9646\u5F3A\u5236\u8FDB\u5165n\u53F7\u8F66\uFF0C\u5FFD\u7565\u767B\u9646\u6240\u9009\u8F66\u53F7)" },
      { name: "SetAN", label: "\u9009\u8F66\u6A21\u5F0F\uFF1A(\u5982\u53EA\u6709\u4E00\u8F86\u8F66\u5219\u586B1\u3002\u767B\u9646\u9875\u624B\u52A8\u9009\u8F66\u5219\u7559\u7A7A\u3002\u5982\u5F00\u542F\u968F\u673A\u6216\u987A\u5E8F\u8F6E\u8BE2\uFF0C\u586BTrue\uFF0C\u5E76\u7528\u4E0B\u9762\u4E24\u4E2A\u53D8\u91CF\u63A7\u5236)" },
      { name: "PlusMode", label: "Plus\u53F7\u968F\u673A\u7684\u8F6E\u8BE2\u65B9\u5F0F (Order\u6216\u8005Random)" },
      { name: "FreeMode", label: "\u666E\u53F7\u968F\u673A\u7684\u8F6E\u8BE2\u65B9\u5F0F (Order/Random\u3002\u5982\u586BPlus\u5219\u4F7F\u7528Plus\u53F7\u6C60)" },
      { name: "CDKEY", label: "\u6CE8\u518C\u53EF\u7528\u7684\u6FC0\u6D3B\u7801 (\u4EE5aaa,bbb,ccc\u683C\u5F0F)" },
      { name: "AutoDeleteCDK", label: "\u8BBE\u7F6E\u4E3A1\u6FC0\u6D3B\u7801\u53EA\u53EF\u7528\u4E00\u6B21" },
      { name: "FKDomain", label: "\u628Asharetoken\u5F53at\u7528\u65F6\uFF0C\u6307\u5B9A\u53CD\u4EE3\u57DF\u540D" },
      { name: "Status", label: "\u670D\u52A1\u72B6\u6001 (\u82E5\u4E3A\u975E\u7A7A\uFF0C\u65E0\u89C6openai\u5B98\u65B9\u6545\u969C\u901A\u544A\uFF0C\u59CB\u7EC8\u5141\u8BB8\u767B\u9646)" },
      { name: "PlusAliveAccounts", label: "plus\u53F7\u6C60\u5B58\u6D3B\u5E8F\u53F7 (\u4EE51,2,3\u683C\u5F0F)\u3010\u53EF\u4E0D\u586B\uFF0C\u5F55\u5165\u8D26\u53F7\u540E\u81EA\u52A8\u586B\u3011" },
      { name: "FreeAliveAccounts", label: "\u666E\u53F7\u5B58\u6D3B\u5E8F\u53F7 (\u4EE51,2,3\u683C\u5F0F)\u3010\u53EF\u4E0D\u586B\uFF0C\u5F55\u5165\u8D26\u53F7\u540E\u81EA\u52A8\u586B\u3011" },
      { name: "rt_1", label: "rt_1\u3010\u53EF\u4E0D\u586B\uFF0C\u5F55\u5165\u8D26\u53F7\u540E\u81EA\u52A8\u586B\u3011" },
      { name: "at_1", label: "at_1 (\u82E5\u5DF2\u6709rt\uFF0Cat\u53EF\u4E0D\u586B)\u3010\u53EF\u4E0D\u586B\uFF0C\u5F55\u5165\u8D26\u53F7\u540E\u81EA\u52A8\u586B\u3011" }
    ];
    return fields.map((field) => `
    <label for="${field.name}">${field.label}</label>
    <input type="text" id="${field.name}" name="${field.name}" ${field.isrequired}>
  `).join("");
  }
  async function handlePlusPostRequest(request) {
    const formData = await request.formData();
    const adminuserName = formData.get("adminusername");
    const refreshToken = formData.get("refresh_token");
    const accountNumber = formData.get("account_number");
    const accountUsers = formData.get("account_users");
    const turnstileResponse = formData.get("cf-turnstile-response");
    if (!turnstileResponse || !await verifyTurnstile(turnstileResponse)) {
      return generatePlusResponse("Turnstile verification failed", adminuserName);
    }
    if (!adminuserName || !refreshToken || !accountNumber) {
      return generatePlusResponse(`Missing parameters: ${!adminuserName ? "adminusername " : ""}${!refreshToken ? "refresh_token " : ""}${!accountNumber ? "account_number " : ""}`, adminuserName);
    }
    const adminusers = await KV.get("Admin");
    if (!adminusers) {
      return new Response("Done", { status: 200 });
    }
    if (!adminusers.split(",").includes(adminuserName)) {
      return generatePlusResponse("Unauthorized access.", adminuserName);
    }
    if (accountUsers) {
      const currentUsers = await KV.get("VIPUsers");
      const newUsers = accountUsers.split(",").map((vipuser) => `${vipuser}_${accountNumber}`).join(",");
      const updatedUsers = `${currentUsers},${newUsers}`;
      await KV.put("VIPUsers", updatedUsers);
    }
    let jsonAccessToken, jsonRefreshToken;
    try {
      const tokenData = JSON.parse(refreshToken);
      const rtKey = `rt_${accountNumber}`;
      const atKey = `at_${accountNumber}`;
      if (tokenData.access_token) {
        jsonAccessToken = tokenData.access_token;
        jsonRefreshToken = tokenData.refresh_token || "";
        await KV.put(atKey, jsonAccessToken);
        await KV.put(rtKey, jsonRefreshToken);
        await addToAliveAccountList(jsonAccessToken, accountNumber);
        return generatePlusResponse(`account_number:
${accountNumber}

refresh_token:
${jsonRefreshToken}

access_token:
${jsonAccessToken}`, adminuserName);
      } else if (tokenData.accessToken) {
        jsonAccessToken = tokenData.accessToken;
        jsonRefreshToken = "";
        await KV.put(atKey, jsonAccessToken);
        await KV.put(rtKey, jsonRefreshToken);
        await addToAliveAccountList(jsonAccessToken, accountNumber);
        return generatePlusResponse(`account_number:
${accountNumber}

refresh_token:
${jsonRefreshToken}

access_token:
${jsonAccessToken}`, adminuserName);
      }
    } catch (e) {
    }
    if (!jsonAccessToken && refreshToken.includes(",")) {
      const tokens = refreshToken.split(",");
      let currentAccountNumber = parseInt(accountNumber);
      for (const token of tokens) {
        const result2 = await processToken(token.trim(), currentAccountNumber, adminuserName);
        currentAccountNumber++;
      }
      return generatePlusResponse("Batch processing completed.", adminuserName);
    }
    const result = await processToken(refreshToken, accountNumber, adminuserName);
    return result;
  }
  async function processToken(token, accountNumber, adminuserName) {
    const rtKey = `rt_${accountNumber}`;
    const atKey = `at_${accountNumber}`;
    if (token.startsWith("fk-")) {
      await KV.put(atKey, token);
      await addToAliveAccountList("", accountNumber);
      return generatePlusResponse(`Share token stored directly`, adminuserName);
    }
    if (token.length > 50) {
      await KV.put(atKey, token);
      await addToAliveAccountList(token, accountNumber);
      return generatePlusResponse(`Access token stored directly`, adminuserName);
    }
    const url = "https://token.oaifree.com/api/auth/refresh";
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body: `refresh_token=${token}`
    });
    if (response.ok) {
      const data = await response.json();
      const newAccessToken = data.access_token;
      await KV.put(atKey, newAccessToken);
      await KV.put(rtKey, token);
      await addToAliveAccountList(newAccessToken, accountNumber);
      return generatePlusResponse(`account_number:
${accountNumber}

refresh_token:
${token}

access_token:
${newAccessToken}`, adminuserName);
    } else {
      return generatePlusResponse("Error fetching access token, Bad refresh token.", adminuserName);
    }
  }
  async function handlePlusGetRequest() {
    const html = await getPlusHTML();
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  }
  async function checkAccountType(access_token) {
    const apiRequest = new Request("https://api.oaifree.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${access_token}`
      },
      body: JSON.stringify({
        "model": "gpt-3.5-turbo",
        "messages": [
          { "role": "user", "content": "hi" }
        ],
        "max_tokens": 1
      })
    });
    try {
      const apiResponse = await fetch(apiRequest);
      if (apiResponse.status === 401) {
        return "Free";
      } else {
        return "Plus";
      }
    } catch (error) {
    }
  }
  async function addToAliveAccountList(accessToken, accountNumber) {
    const accountType = await checkAccountType(accessToken);
    const aliveAccountsKey = `${accountType}AliveAccounts`;
    let aliveAccount = await KV.get(aliveAccountsKey);
    let aliveAccountList = aliveAccount ? aliveAccount.split(",") : [];
    if (!aliveAccountList.includes(accountNumber)) {
      aliveAccountList.push(accountNumber);
      await KV.put(aliveAccountsKey, aliveAccountList.join(","));
    }
  }
  async function generatePlusResponse(message, adminuserName) {
    const errorHtml = `
    <div class="ulp-field ulp-error">
      <div class="ulp-error-info">
        <span class="ulp-input-error-icon" role="img" aria-label="Error"></span>
        ${message}
      </div>
    </div>
  `;
    const replacements = [
      { target: '<button type="submit">Submit</button>', replacement: errorHtml + '<button class="continue-btn" type="submit">Continue</button>' },
      { target: '<input type="password" id="adminsername" name="adminusername" required>', replacement: `<input type="password" id="adminsername" name="adminusername" value="${adminuserName}" required>` }
    ];
    const html = await getPlusHTML();
    let responseHtml = html;
    for (const { target, replacement } of replacements) {
      responseHtml = responseHtml.replace(target, replacement);
    }
    return new Response(responseHtml, { headers: { "Content-Type": "text/html" } });
  }
  async function getPlusHTML() {
    const WorkerURL = myWorkerURL;//await KV.get("WorkerURL");
    const turnstileSiteKey = await KV.get("TurnstileSiteKey");
    const removeTurnstile = "";//await KV.get("RemoveTurnstile") || "";
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Token Management</title>
  <style>
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      background-color: #f2f2f5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      margin: 0;
    }
    .login-container {
      background-color: #ffffff;
      padding: 40px;
      border-radius: 12px;
      box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
      max-width: 400px;
      width: 100%;
      text-align: center;
    }
    .login-container h1 {
      margin-bottom: 24px;
      font-size: 28px;
      color: #333;
      font-weight: 600;
    }
    .login-container label {
      display: block;
      font-size: 16px;
      margin-bottom: 8px;
      color: #555;
      text-align: left;
    }
    .login-container input {
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 8px;
      font-size: 16px;
      box-sizing: border-box;
      width: 100%;
      margin-bottom: 20px;
    }
    .login-container .button-container {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .login-container .button-container .row {
      display: flex;
      gap: 10px;
    }
    .login-container button {
      padding: 12px;
      background-color: #007aff;
      border: none;
      border-radius: 8px;
      color: white;
      font-size: 18px;
      cursor: pointer;
      transition: background-color 0.3s;
      flex: 1;
    }
    .login-container button:hover {
      background-color: #005fcb;
    }
    .ulp-field.ulp-error .ulp-error-info {
      margin-top: 4px;
      margin-bottom: 4px;
      display: flex;
      font-size: 10px;
      line-height: 1;
      text-align: left;
      color: #d00e17;
    }
    .ulp-input-error-icon {
      margin-right: 4px;
    }
  </style>
</head>
<body>
  <div class="login-container">
    <h1>Token Management</h1>
    <form id="managePlus" action="/token" method="POST">
      <label for="adminusername">Admin Username:</label>
      <input type="password" id="adminsername" name="adminusername" required>
      <label for="refresh_token">RT/AT:</label>
      <input type="text" id="refresh_token" name="refresh_token" required>
      <label for="account_number">Account Number:</label>
      <input type="number" id="account_number" name="account_number" required>
      <label for="account_users">Account Users:</label>
      <input type="text" id="account_users" name="account_users">
      <input type="hidden" id="cf-turnstile-response" name="cf-turnstile-response" required>
      <div class="button-container">
        <button type="submit">Submit</button>
        <div class="row">
          <button type="button" onclick="window.location.href='https://token.oaifree.com/auth'">Get Token</button>
          <button type="button" onclick="window.location.href='https://${WorkerURL}'">Go Login</button>
        </div>
      </div>
      <div style="height: 20px;"></div>
      <div class="cf-turnstile" data-sitekey="${turnstileSiteKey}" data-callback="onTurnstileCallback"></div>
    </form>
  </div>
  <script>
  if ('${removeTurnstile}') {
       document.getElementById('cf-turnstile-response').value= "111";
      }

  function onTurnstileCallback(token) {
    document.getElementById('cf-turnstile-response').value = token;
  }

  document.getElementById('managePlus').addEventListener('submit', function(event) {
    if (!document.getElementById('cf-turnstile-response').value) {
      alert('Please complete the verification.');
      event.preventDefault();
    }
  });
  <\/script>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer><\/script>
</body>
</html>
`;
  }
  async function handleExportGetRequest(request) {
    const url = new URL(request.url);
    const adminUserName = url.searchParams.get("admin");
    const tokenType = url.searchParams.get("token");
    const accountType = url.searchParams.get("type");
    if (!adminUserName || !tokenType || !accountType) {
      const html = await getExportHTML();
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    }
    const adminusers = await KV.get("Admin") || "";
    if (adminusers.split(",").includes(adminUserName)) {
      const validTokenTypes = ["rt", "at"];
      const validAccountTypes = ["Free", "Plus"];
      if (!validTokenTypes.includes(tokenType) || !validAccountTypes.includes(accountType)) {
        return new Response("Invalid token or account type", { status: 400 });
      }
      return await exportToken(tokenType, accountType);
    } else {
      return new Response("Unauthorized access", { status: 403 });
    }
  }
  async function exportToken(tokenType, accountType) {
    const accountTypeKey = `${accountType}AliveAccounts`;
    let aliveAccount = await KV.get(accountTypeKey);
    if (!aliveAccount) {
      return new Response("No accounts found", { status: 404 });
    }
    let accountNumbers = aliveAccount.split(",");
    let tokens = [];
    const batchSize = 10;
    for (let i = 0; i < accountNumbers.length; i += batchSize) {
      const batch = accountNumbers.slice(i, i + batchSize);
      const batchTokens = await Promise.all(batch.map(async (accountNumber) => {
        if (tokenType == "at") {
          return await refreshAT("", accountNumber);
        } else {
          let rtKey = `${tokenType}_${accountNumber}`;
          return await KV.get(rtKey);
        }
      }));
      tokens.push(...batchTokens);
    }
    let fileContent = tokens.join("\n");
    let fileName = `${tokenType}.txt`;
    return new Response(fileContent, {
      headers: {
        "Content-Type": "text/plain",
        "Content-Disposition": `attachment; filename=${fileName}`
      }
    });
  }
  async function handleExportPostRequest(request) {
    const formData = await request.formData();
    const adminPassword = formData.get("adminpassword");
    const tokenType = formData.get("token_type");
    const accountType = formData.get("account_type");
    const operationType = formData.get("operation_type");
    const turnstileResponse = formData.get("cf-turnstile-response");
    if (!turnstileResponse || !await verifyTurnstile(turnstileResponse)) {
      return new Response("Turnstile verification failed", { status: 403 });
    }
    const adminusers = await KV.get("Admin");
    if (!adminusers) {
      return new Response("Admin list is empty", { status: 500 });
    }
    if (adminusers.split(",").includes(adminPassword)) {
      if (operationType == "txt") {
        const validTokenTypes = ["rt", "at"];
        const validAccountTypes = ["Free", "Plus"];
        if (!validTokenTypes.includes(tokenType) || !validAccountTypes.includes(accountType)) {
          return new Response("Invalid token or account type", { status: 400 });
        }
        return await exportToken(tokenType, accountType);
      } else {
        const WorkerURL = myWorkerURL;//await KV.get("WorkerURL");
        return new Response(`https://${WorkerURL}/export?admin=${adminPassword}&type=${accountType}&token=${tokenType}`, { status: 200 });
      }
    } else {
      return new Response("Unauthorized access", { status: 403 });
    }
  }
  async function getExportHTML() {
    const turnstileSiteKey = await KV.get("TurnstileSiteKey");
    const removeTurnstile = "";//await KV.get("RemoveTurnstile") || "";
    return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Export Tokens</title>
    <style>
      body {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        background-color: #f2f2f5;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        margin: 0;
      }
      .export-container {
        background-color: #ffffff;
        padding: 40px;
        border-radius: 12px;
        box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
        max-width: 400px;
        width: 100%;
        text-align: center;
      }
      .export-container h1 {
        margin-bottom: 24px;
        font-size: 28px;
        color: #333;
        font-weight: 600;
      }
      .export-container label {
        display: block;
        font-size: 16px;
        margin-bottom: 8px;
        color: #555;
        text-align: left;
      }
      .export-container input, .export-container select {
        padding: 12px;
        border: 1px solid #ddd;
        border-radius: 8px;
        font-size: 16px;
        box-sizing: border-box;
        width: 100%;
        margin-bottom: 20px;
        height: 48px;
      }
      .export-container button {
        padding: 12px;
        background-color: #007aff;
        border: none;
        border-radius: 8px;
        color: white;
        font-size: 18px;
        cursor: pointer;
        transition: background-color 0.3s;
      }
      .export-container button:hover {
        background-color: #005fcb;
      }
    </style>
  </head>
  <body>
    <div class="export-container">
      <h1>Export Tokens</h1>
      <form id="exportTokens" action="/export" method="POST">
        <label for="adminpassword">Admin Password:</label>
        <input type="password" id="adminpassword" name="adminpassword" required>
        <label for="token_type">Token Type:</label>
        <select id="token_type" name="token_type" required>
          <option value="rt">Refresh Token</option>
          <option value="at">Access Token</option>
        </select>
        <label for="account_type">Account Type:</label>
        <select id="account_type" name="account_type" required>
          <option value="Free">Free</option>
          <option value="Plus">Plus</option>
        </select>
        <label for="operation_type">Operation Type:</label>
        <select id="operation_type" name="operation_type" required>
          <option value="txt">Download TXT</option>
          <option value="link">Generate Link</option>
        </select>
        <input type="hidden" id="cf-turnstile-response" name="cf-turnstile-response" required>
        <div class="cf-turnstile" data-sitekey="${turnstileSiteKey}" data-callback="onTurnstileCallback"></div>
        <button type="submit">Export</button>
      </form>
    </div>
    <script>
    if ('${removeTurnstile}') {
       document.getElementById('cf-turnstile-response').value= "111";
      }
      function onTurnstileCallback(token) {
        document.getElementById('cf-turnstile-response').value = token;
      }
  
      document.getElementById('exportTokens').addEventListener('submit', function(event) {
        if (!document.getElementById('cf-turnstile-response').value) {
          alert('Please complete the verification.');
          event.preventDefault();
        }
      });
    <\/script>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer><\/script>
  </body>
  </html>
  `;
  }
  async function handleAdminPostRequest(request) {
    const formData = await request.formData();
    const adminuserName = formData.get("adminusername");
    const chooseAccount = formData.get("choose_account");
    const forceCar = formData.get("force_car");
    const temporaryAccount = formData.get("temporary_account");
    const turnstileResponse = formData.get("cf-turnstile-response");
    if (!turnstileResponse || !await verifyTurnstile(turnstileResponse)) {
      return generateAdminResponse("Turnstile verification failed");
    }
    if (!adminuserName) {
      return generateAdminResponse("Missing adminusername parameter");
    }
    const adminusers = await KV.get("Admin") || "";
    if (!adminusers || !adminusers.split(",").includes(adminuserName)) {
      return generateAdminResponse("Unauthorized");
    }
    if (chooseAccount) {
      if (chooseAccount.toLowerCase() === "true") {
        await KV.put("SetAN", "True");
      } else if (chooseAccount.toLowerCase() === "no") {
        await KV.put("SetAN", "");
      } else if (!isNaN(chooseAccount)) {
        await KV.put("SetAN", chooseAccount);
      }
    }
    if (forceCar) {
      const forceCarValue = forceCar.toLowerCase() === "yes" ? "1" : "0";
      await KV.put("ForceAN", forceCarValue);
    }
    if (temporaryAccount) {
      await KV.put("TemporaryAN", temporaryAccount);
    }
    return generateAdminResponse("Operation completed successfully");
  }
  async function handleAdminGetRequest() {
    const html = await getAdminHTML();
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  }
  async function generateAdminResponse(message) {
    const errorHtml = `
 <div class="ulp-field ulp-error">
   <div class="ulp-error-info">
     <span class="ulp-input-error-icon" role="img" aria-label="Error"></span>
     ${message}
   </div>
 </div>
 `;
    const html = await getAdminHTML();
    const responseHtml = html.replace(
      '<button type="submit">Submit</button>',
      errorHtml + '<button type="submit">Submit</button>'
    );
    return new Response(responseHtml, { headers: { "Content-Type": "text/html" } });
  }
  async function getAdminHTML() {
    const WorkerURL = myWorkerURL;//await KV.get("WorkerURL");
    const turnstileSiteKey = await KV.get("TurnstileSiteKey");
    const removeTurnstile = "";//await KV.get("RemoveTurnstile") || "";
    return `
  <!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>System Manager</title>
  <style>
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      background-color: #f2f2f5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      margin: 0;
    }
    .login-container {
      background-color: #ffffff;
      padding: 40px;
      border-radius: 12px;
      box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
      max-width: 400px;
      width: 100%;
      text-align: center;
    }
    .login-container h1 {
      margin-bottom: 24px;
      font-size: 28px;
      color: #333;
      font-weight: 600;
    }
    .login-container label {
      display: block;
      font-size: 16px;
      margin-bottom: 8px;
      color: #555;
      text-align: left;
    }
    .login-container input, .login-container select, .login-container button {
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 8px;
      font-size: 16px;
      box-sizing: border-box;
      width: 100%;
      margin-bottom: 20px;
    }
    .login-container select {
      height: 48px;
    }
    .login-container button {
      background-color: #007aff;
      border: none;
      color: white;
      font-size: 18px;
      cursor: pointer;
      transition: background-color 0.3s;
    }
    .login-container button:hover {
      background-color: #005fcb;
    }
    .tokenmanagement-buttons, .usagemanagement-buttons {
      display: flex;
      justify-content: space-between;
    }
    .tokenmanagement-buttons a, .usage-link, .return-button {
      display: block;
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 8px;
      font-size: 16px;
      box-sizing: border-box;
      width: 48%;
      background-color: #007aff;
      color: white;
      text-align: center;
      text-decoration: none;
      transition: background-color 0.3s;
      margin-top: 10px;
    }
    .tokenmanagement-buttons a:hover, .usage-link:hover, .return-button:hover {
      background-color: #005fcb;
    }
    .ulp-field.ulp-error .ulp-error-info {
      margin-top: 4px;
      margin-bottom: 4px;
      display: flex;
      font-size: 14px;
      line-height: 1.4;
      text-align: left;
      color: #d00e17;
    }
    .ulp-input-error-icon {
      margin-right: 4px;
    }
  </style>
</head>
<body>
  <div class="login-container">
    <h1>System Manager</h1>
    <form id="manageAccountForm" action="/admin" method="POST">
      <input type="hidden" id="cf-turnstile-response" name="cf-turnstile-response" required>
      <label for="adminusername">Admin Username:</label>
      <input type="password" id="adminusername" name="adminusername" required>
      <label for="choose_account">Choose Account:</label>
      <input type="text" id="choose_account" name="choose_account" placeholder="True, No, or Number">
      <label for="force_car">Force Car:</label>
      <select id="force_car" name="force_car">
        <option value="">Choose...</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
      <label for="temporary_account">Temporary Account:</label>
      <input type="text" id="temporary_account" name="temporary_account">
      <button type="submit">Submit</button>
    </form>
    <div class="tokenmanagement-buttons">
      <a href="https://${WorkerURL}/token">Token Management</a>
      <a href="https://${WorkerURL}/export">Export Tokens</a>
    </div>
    <div class="usagemanagement-buttons">
    <a href="https://${WorkerURL}/user" class="return-button">User Management</a>
      <a href="https://${WorkerURL}/usage" class="usage-link">Query User Usage</a>
    </div>
    <div style="height: 20px;"></div>
    <div class="cf-turnstile" data-sitekey="${turnstileSiteKey}" data-callback="onTurnstileCallback"></div>
  </div>
  <script>
  if ('${removeTurnstile}') {
       document.getElementById('cf-turnstile-response').value= "111";
      }
  function onTurnstileCallback(token) {
    document.getElementById('cf-turnstile-response').value = token;
  }

  document.getElementById('manageAccountForm').addEventListener('submit', function(event) {
    if (!document.getElementById('cf-turnstile-response').value) {
      alert('Please complete the verification.');
      event.preventDefault();
    }
  });
  <\/script>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer><\/script>
</body>
</html>

  `;
  }
  async function handleUserGetRequest() {
    const html = await getUserHTML();
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  }
  async function handleUserPostRequest(request) {
    const formData = await request.formData();
    const adminuserName = formData.get("adminusername");
    const newUsers = formData.get("newusers");
    const userType = formData.get("user_type");
    const turnstileResponse = formData.get("cf-turnstile-response");
    const userRegex = new RegExp(`^${newUsers}_(\\d+)$`);
    let fullUserName = newUsers;
    const defaultusers = await KV.get("Users") || "";
    const vipusers = await KV.get("VIPUsers") || "";
    const freeusers = await KV.get("FreeUsers") || "";
    const admin = await KV.get("Admin") || "";
    const users = `${defaultusers},${vipusers},${freeusers},${admin}`;
    users.split(",").forEach((user) => {
      const match = user.match(userRegex);
      if (match) {
        fullUserName = user;
      }
    });
    if (!turnstileResponse || !await verifyTurnstile(turnstileResponse)) {
      return generateUserResponse("Turnstile verification failed");
    }
    if (newUsers && userType === "query-limits") {
      const accountNumber = await getToCheckAccountNumber(fullUserName, "Plus");
      const accessToken = await KV.get(`at_${accountNumber}`) || "1";
      const shareToken = await getToCheckShareToken(fullUserName, accessToken);
      const queryLimit = await handleQueryRequest(accessToken, shareToken);
      return generateUserResponse(`User: ${fullUserName}, AN: ${accountNumber}, ${queryLimit}`);
    }
    if (!adminuserName || !newUsers || !userType) {
      return generateUserResponse(`Missing parameters: ${!adminuserName ? "adminusername " : ""}${!newUsers ? "newusers " : ""}${!userType ? "user_type " : ""}`);
    }
    const adminusers = await KV.get("Admin") || "";
    if (!adminusers || !adminusers.split(",").includes(adminuserName)) {
      return generateUserResponse("Unauthorized");
    }
    if (userType === "delete") {
      await deleteUsers(fullUserName);
      const users2 = await KV.get("Users") || "";
      const freeUsers = await KV.get("FreeUsers") || "";
      const vipUsers = await KV.get("VIPUsers") || "";
      return generateUserResponse(`User deleted successfully.

users:
${users2}

freeusers:
${freeUsers}

vipusers:
${vipUsers}`);
    } else {
      await addUsers(newUsers, userType);
      const users2 = await KV.get("Users") || "";
      const freeUsers = await KV.get("FreeUsers") || "";
      const vipUsers = await KV.get("VIPUsers") || "";
      const WorkerURL = myWorkerURL;//await KV.get("WorkerURL");
      return generateUserResponse(`User Added successfully

Login link:
https://${WorkerURL}/?un=${newUsers}

users:
${users2}

freeusers:
${freeUsers}

vipusers:
${vipUsers}`);
    }
  }
  async function addUsers(newUsers, userType) {
    const currentUsers = await KV.get(userType) || "";
    const updatedUsers = `${currentUsers},${newUsers}`.replace(/^,/, "");
    await KV.put(userType, updatedUsers);
  }
  async function deleteUsers(usersToDelete) {
    const userTypes = ["Users", "FreeUsers", "VIPUsers"];
    for (const userType of userTypes) {
      const currentUsers = await KV.get(userType) || "";
      const updatedUsers = currentUsers.split(",").filter((user) => !usersToDelete.split(",").includes(user)).join(",");
      await KV.put(userType, updatedUsers);
    }
    const accountNumber = await getToCheckAccountNumber(userName, "Plus");
    return await deleteShareToken(usersToDelete, accountNumber);
  }
  async function deleteShareToken(userName2, accountNumber) {
    const url = "https://chat.oaifree.com/token/register";
    const passed = generatePassword(userName2);
    const accessToken = await KV.get(`at_${accountNumber}`) || "xxx";
    const body = new URLSearchParams({
      access_token: accessToken,
      // 使用从全局变量中获取的 accessToken
      unique_name: passed,
      //前缀+无后缀用户名
      // site_limit: '', // 限制的网站
      expires_in: "-1"
      // token有效期（单位为秒），填 0 则永久有效
      // gpt35_limit: '0', // gpt3.5 对话限制
      // gpt4_limit: '0', // gpt4 对话限制，-1为不限制
      // show_conversations: 'false', // 是否显示所有人的会话
      // temporary_chat: 'false', //默认启用临时聊天
      // show_userinfo: 'false', // 是否显示用户信息
      // reset_limit: 'false' // 是否重置对话限制
    }).toString();
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });
    return "Delete ST suceed.";
  }
  async function getToCheckShareToken(userName2, accessToken) {
    const url = "https://chat.oaifree.com/token/register";
    const passed = generatePassword(userName2);
    const body = new URLSearchParams({
      access_token: accessToken,
      // 使用从全局变量中获取的 accessToken
      unique_name: passed,
      //前缀+无后缀用户名
      //site_limit: '', // 限制的网站
      //expires_in: '0', // token有效期（单位为秒），填 0 则永久有效
      //gpt35_limit: '-1', // gpt3.5 对话限制
      //gpt4_limit: '-1', // gpt4 对话限制，-1为不限制
      //show_conversations: 'false', // 是否显示所有人的会话
      //temporary_chat: 'false', //默认启用临时聊天
      //show_userinfo: 'false', // 是否显示用户信息
      reset_limit: "false"
      // 是否重置对话限制
    }).toString();
    const apiResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });
    const responseText = await apiResponse.text();
    const tokenKeyMatch = /"token_key":"([^"]+)"/.exec(responseText);
    const tokenKey = tokenKeyMatch ? tokenKeyMatch[1] : "Can not get share token.";
    return tokenKey;
  }
  async function generateUserResponse(message) {
    const errorHtml = `
 <div class="ulp-field ulp-error">
   <div class="ulp-error-info">
     <span class="ulp-input-error-icon" role="img" aria-label="Error"></span>
     ${message}
   </div>
 </div>
 `;
    const html = await getUserHTML();
    const responseHtml = html.replace(
      '<button type="submit">Submit</button>',
      errorHtml + '<button type="submit">Submit</button>'
    );
    return new Response(responseHtml, { headers: { "Content-Type": "text/html" } });
  }
  async function getToCheckAccountNumber(userName2, antype) {
    const lastLoginLogs = await KV.get(`${antype}LoginLogs`);
    if (lastLoginLogs) {
      const logArray = JSON.parse(lastLoginLogs);
      const userLogs = logArray.filter((log) => log.user === userName2);
      if (userLogs.length > 0) {
        const lastAccount = userLogs[userLogs.length - 1].accountNumber;
        return lastAccount;
      }
    }
    return 1;
  }
  async function handleQueryRequest(accessToken, shareToken) {
    const limits = await queryLimits(accessToken, shareToken);
    return `Usage: GPT-4: ${limits.gpt4Limit}, GPT-3.5: ${limits.gpt35Limit}`;
  }
  async function queryLimits(accessToken, shareToken) {
    const CACHE_TTL = 60;
    const MAX_RETRIES = 3;
    const cacheKey = `limits_${shareToken}`;
    const cachedData = await KV.get(cacheKey);
    if (cachedData) {
      return JSON.parse(cachedData);
    }
    const url = `https://chat.oaifree.com/token/info/${shareToken}`;
    let attempt = 0;
    while (attempt < MAX_RETRIES) {
      try {
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          }
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch limits (status: ${response.status})`);
        }
        const result = await response.json();
        const data = {
          gpt4Limit: result.gpt4_limit,
          gpt35Limit: result.gpt35_limit
        };
        await KV.put(cacheKey, JSON.stringify(data), { expirationTtl: CACHE_TTL });
        return data;
      } catch (error) {
        console.error(`Attempt ${attempt + 1} failed:`, error);
        attempt += 1;
        if (attempt >= MAX_RETRIES) {
          throw new Error("Failed to fetch limits after multiple attempts");
        }
        await new Promise((resolve) => setTimeout(resolve, 1e3));
      }
    }
  }
  async function getUserHTML() {
    const turnstileSiteKey = await KV.get("TurnstileSiteKey");
    const removeTurnstile = "";//await KV.get("RemoveTurnstile") || "";
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Manage Account</title>
  <style>
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      background-color: #f2f2f5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      margin: 0;
    }
    .login-container {
      background-color: #ffffff;
      padding: 40px;
      border-radius: 12px;
      box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
      max-width: 400px;
      width: 100%;
      text-align: center;
    }
    .login-container h1 {
      margin-bottom: 24px;
      font-size: 28px;
      color: #333;
      font-weight: 600;
    }
    .login-container label {
      display: block;
      font-size: 16px;
      margin-bottom: 8px;
      color: #555;
      text-align: left;
    }
    .login-container input, .login-container select, .login-container button {
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 8px;
      font-size: 16px;
      box-sizing: border-box;
      width: 100%;
      margin-bottom: 20px;
    }
    .login-container select {
      height: 48px;
    }
    .login-container button {
      background-color: #007aff;
      border: none;
      color: white;
      font-size: 18px;
      cursor: pointer;
      transition: background-color 0.3s;
    }
    .login-container button:hover {
      background-color: #005fcb;
    }
    .ulp-field.ulp-error .ulp-error-info {
      margin-top: 4px;
      margin-bottom: 4px;
      display: flex;
      font-size: 14px;
      line-height: 1.4;
      text-align: left;
      color: #d00e17;
  }
  .ulp-input-error-icon {
      margin-right: 4px;
  }
  </style>
</head>
<body>
  <div class="login-container">
    <h1>Manage Account</h1>
    <form id="manageAccountForm" action="/user" method="POST">
    <input type="hidden" id="cf-turnstile-response" name="cf-turnstile-response" required>
      <label for="adminusername">Admin Username:</label>
      <input type="password" id="adminusername" name="adminusername">
      <label for="newusers">User Name:</label>
      <input type="text" id="newusers" name="newusers" required>
      <label for="user_type">Operation Type:</label>
      <select id="user_type" name="user_type" required>
        <option value="query-limits">Query Usage</option>
        <option value="Users">Add Users</option>
        <option value="FreeUsers">Add Free Users</option>
        <option value="VIPUsers">Add VIP Users</option>
        <option value="delete">Delete Users</option>
       
      </select>
      <button type="submit">Submit</button>
      <div style="height: 20px;"></div>
      <div class="cf-turnstile" data-sitekey="${turnstileSiteKey}" data-callback="onTurnstileCallback"></div>
    </form>
  </div>
  <script>
if ('${removeTurnstile}') {
       document.getElementById('cf-turnstile-response').value= "111";
      }
  function onTurnstileCallback(token) {
    document.getElementById('cf-turnstile-response').value = token;
  }

  document.getElementById('manageAccountForm').addEventListener('submit', function(event) {
    if (!document.getElementById('cf-turnstile-response').value) {
      alert('Please complete the verification.');
      event.preventDefault();
    }
  });
  <\/script>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer><\/script>
</body>
</html>
`;
  }
  async function handleRegisterPostRequest(request) {
    const formData = await request.formData();
    const cdkey = formData.get("cdkey");
    const username = formData.get("username");
    const turnstileResponse = formData.get("cf-turnstile-response");
    if (!await verifyTurnstile(turnstileResponse)) {
      return generateRegisterResponse("Turnstile verification failed");
    }
    const autoDeleteCDK = await KV.get("AutoDeleteCDK");
    const cdkeyStore = await KV.get("CDKEY") || "";
    const cdkeyList = cdkeyStore ? cdkeyStore.split(",") : [];
    if (!cdkeyList.includes(cdkey)) {
      return generateRegisterResponse("Invalid CDKEY");
    }
    await registerlog(username, cdkey);
    if (autoDeleteCDK) {
      const updatedCdkeyList = cdkeyList.filter((key) => key !== cdkey);
      await KV.put("CDKEY", updatedCdkeyList.join(","));
    }
    const freeUsers = await KV.get("FreeUsers");
    const freeUsersList = freeUsers ? freeUsers.split(",") : [];
    if (freeUsersList.includes(username)) {
      return generateRegisterResponse("Username already exist.");
    }
    freeUsersList.push(username);
    await KV.put("FreeUsers", freeUsersList.join(","));
    return generateRegisterResponse("Registration successful");
  }
  async function registerlog(userName2, cdkey) {
    const currentTime = (/* @__PURE__ */ new Date()).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    const logEntry = {
      user: userName2,
      time: currentTime,
      cdkey
    };
    const lastDeleteLogs = await KV.get(`RegisterLogs`);
    let logArray = [];
    if (lastDeleteLogs) {
      logArray = JSON.parse(lastDeleteLogs);
    }
    logArray.push(logEntry);
    await KV.put(`RegisterLogs`, JSON.stringify(logArray));
  }
  async function generateRegisterResponse(message) {
    const errorHtml = `
   <div class="ulp-field ulp-error">
     <div class="ulp-error-info">
       <span class="ulp-input-error-icon" role="img" aria-label="Error"></span>
       ${message}
     </div>
   </div>
   `;
    const html = await getRegisterHTML();
    const responseHtml = html.replace(
      '<button class="continue-btn" type="button" id="continueBtn">Continue</button>',
      errorHtml + '<button class="continue-btn" type="button" id="continueBtn">Continue</button>'
    );
    return new Response(responseHtml, { headers: { "Content-Type": "text/html" } });
  }
  async function getRegisterHTML() {
    const WorkerURL = myWorkerURL;//await KV.get("WorkerURL");
    const turnstileSiteKey = await KV.get("TurnstileSiteKey");
    const websiteName = await KV.get("WebName") || "Haibara AI";
    // const logourl = await KV.get("LogoURL") || logo;
    const logourl = logo;
    const removeTurnstile = "";//await KV.get("RemoveTurnstile") || "";
    return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <link rel="apple-touch-icon" sizes="180x180" href="https://cdn1.oaifree.com/_next/static/media/apple-touch-icon.82af6fe1.png"/>
      <link rel="icon" type="image/png" sizes="32x32" href="https://cdn4.oaifree.com/_next/static/media/favicon-32x32.630a2b99.png"/>
      <link rel="icon" type="image/png" sizes="16x16" href="https://cdn4.oaifree.com/_next/static/media/favicon-16x16.a052137e.png"/>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Sign Up - ${websiteName}</title>
      <style>
          @charset "UTF-8";
          .oai-header img {
              height: auto;
              width: 128px;
              margin-top: 80px;
          }
  
          a {
              font-weight: 400;
              text-decoration: inherit;
              color: #10a37f;
          }
  
          .main-container {
              flex: 1 0 auto;
              min-height: 0;
              display: grid;
              box-sizing: border-box;
              grid-template-rows: [left-start center-start right-start] 1fr [left-end center-end right-end];
              grid-template-columns: [left-start center-start] 1fr [left-end right-start] 1fr [center-end right-end];
              align-items: center;
              justify-content: center;
              justify-items: center;
              grid-column-gap: 160px;
              column-gap: 160px;
              padding: 80px;
              width: 100%;
          }
  
          .login-container {
              background-color: #fff;
              padding: 0 40px 40px;
              border-radius: 3px;
              box-shadow: none;
              width: 320px;
              box-sizing: content-box;
              flex-shrink: 0;
          }
  
          .title-wrapper {
              padding: 0 40px 24px;
              box-sizing: content-box;
              text-align: center;
          }
  
          .title {
              font-size: 32px;
              font: 'S\xF6hne';
              margin: 0;
              color: #2d333a;
              width: 320px;
          }
  
          .input-wrapper {
              position: relative;
              margin-bottom: 25px;
              width: 320px;
              box-sizing: content-box;
          }
  
          .email-input {
              -webkit-appearance: none;
              -moz-appearance: none;
              appearance: none;
              background-color: #fff;
              border: 1px solid #c2c8d0;
              border-radius: 6px;
              box-sizing: border-box;
              color: #2d333a;
              font-family: inherit;
              font-size: 16px;
              height: 52px;
              line-height: 1.1;
              outline: none;
              padding-block: 1px;
              padding-inline: 2px;
              padding: 0 16px;
              transition:
                  box-shadow 0.2s ease-in-out,
                  border-color 0.2s ease-in-out;
              width: 100%;
              text-rendering: auto;
              letter-spacing: normal;
              word-spacing: normal;
              text-transform: none;
              text-indent: 0px;
              text-shadow: none;
              display: inline-block;
              text-align: start;
              margin: 0;
          }
  
          .email-input:focus,
          .email-input:valid {
              border: 1px solid #10a37f;
              outline: none;
          }
  
          .email-input:focus-within {
              box-shadow: 1px #10a37f;
          }
  
          .email-input:focus + .email-label,
          .email-input:valid + .email-label {
              font-size: 14px;
              top: 0;
              left: 10px;
              color: #10a37f;
              background-color: #fff;
          }
  
          .email-label {
              position: absolute;
              top: 26px;
              left: 16px;
              background-color: #fff;
              color: #6f7780;
              font-size: 16px;
              font-weight: 400;
              margin-bottom: 8px;
              max-width: 90%;
              overflow: hidden;
              pointer-events: none;
              padding: 1px 6px;
              text-overflow: ellipsis;
              transform: translateY(-50%);
              transform-origin: 0;
              transition:
                  transform 0.15s ease-in-out,
                  top 0.15s ease-in-out,
                  padding 0.15s ease-in-out;
              white-space: nowrap;
              z-index: 1;
          }
  
          .continue-btn {
              position: relative;
              height: 52px;
              width: 320px;
              background-color: #10a37f;
              color: #fff;
              margin: 24px 0 0;
              align-items: center;
              justify-content: center;
              display: flex;
              border-radius: 6px;
              padding: 4px 16px;
              font: inherit;
              border-width: 0px;
              cursor: pointer;
          }
  
          .continue-btn:hover {
              box-shadow: inset 0 0 0 150px #0000001a;
          }
  
          :root {
              font-family:
                  S\xF6hne,
                  -apple-system,
                  BlinkMacSystemFont,
                  Helvetica,
                  sans-serif;
              line-height: 1.5;
              font-weight: 400;
              font-synthesis: none;
              text-rendering: optimizeLegibility;
              -webkit-font-smoothing: antialiased;
              -moz-osx-font-smoothing: grayscale;
          }
  
          .page-wrapper {
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              min-height: 100%;
          }
  
          .oai-header {
              display: flex;
              justify-content: center;
              align-items: center;
              width: 100%;
              background-color: #fff;
          }
  
          body {
              background-color: #fff;
              display: block;
              margin: 0;
          }
  
          .content-wrapper {
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              width: 100%;
              height: auto;
              white-space: normal;
              border-radius: 5px;
              position: relative;
              grid-area: center;
              box-shadow: none;
              vertical-align: baseline;
              box-sizing: content-box;
          }
  
          .checkbox-wrapper {
              margin: 20px 0;
              display: flex;
              align-items: center;
          }
  
          .checkbox-label {
              margin-left: 8px;
              font-weight: 600;
              color: #6f7780;
              font-size: 14px;
          }
  
          .help-icon {
              display: inline-block;
              margin-left: 5px;
              color: #10a37f;
              cursor: pointer;
              font-weight: bold;
          }
  
          .tooltip {
              visibility: hidden;
              min-width: 140px;
              max-width: 300px;
              line-height: 20px; 
              min-height: 90px; 
              display: flex;
              align-items: center;
              justify-content: center;
              background-color: black;
              color: #fff;
              text-align: center;
              border-radius: 6px;
              
              position: absolute;
              z-index: 1;
              bottom: 150%;
              left: 50%;
              margin-left: -70px; /* Half of the width to center the tooltip */
              opacity: 0;
              transition: opacity 0.3s, visibility 0.3s ease-in-out;
          }
  
          .tooltip::after {
              content: "";
              position: absolute;
              top: 100%;
              left: 50%;
              margin-left: -5px;
              border-width: 5px;
              border-style: solid;
              border-color: black transparent transparent transparent;
          }
  
          .field-container {
              display: flex;
              margin-bottom: 20px;
              width: 320px;
              box-sizing: content-box;
          }
  
          .field-container select {
              flex: 3;
              padding: 12px;
              border: 1px solid #c2c8d0;
              border-radius: 6px 0 0 6px;
              font-size: 16px;
          }
  
          .field-container input[type="number"] {
              flex: 1;
              padding: 12px;
              border: 1px solid #c2c8d0;
              border-radius: 0 6px 6px 0;
              font-size: 16px;
          }
  
          .cf-turnstile {
              display: flex;
              justify-content: center;
              margin-top: 10px;
          }
          .other-page {
              text-align: center;
              margin-top: 14px;
              margin-bottom: 0;
              font-size: 14px;
              width: 320px;
          }
          .divider-wrapper {
              display: flex;
              flex-direction: row;
              text-transform: uppercase;
              border: none;
              font-size: 12px;
              font-weight: 400;
              margin: 0;
              padding: 24px 0 0;
              align-items: center;
              justify-content: center;
              width: 320px;
              vertical-align: baseline;
          }
          
          .divider-wrapper:before {
              content: "";
              border-bottom: 1px solid #c2c8d0;
              flex: 1 0 auto;
              height: .5em;
              margin:0
          }
          .divider-wrapper:after{
              content: "";
              border-bottom: 1px solid #c2c8d0;
              flex: 1 0 auto;
              height: .5em;
              margin:0
          }
          .ulp-field.ulp-error .ulp-error-info {
            margin-top: 4px;
            margin-bottom: 4px;
            display: flex;
            font-size: 14px;
            line-height: 1.4;
            text-align: left;
            color: #d00e17;
        }
        
        .ulp-input-error-icon {
            margin-right: 4px;
        }

        .footer {
          text-align: center;
          font-size: 12px;
          padding: 10px;
      }

      .footer a {
          color: black;
          text-decoration: none;
      }

      .footer a:hover {
          text-decoration: none;
          color: black;
      }

          </style>
          </head>
          <body>
              <div id="root">
                  <div class="page-wrapper">
                      <header class="oai-header">
                          <a href="https://${WorkerURL}/admin">
                              <img src="${logourl}" alt="Logo">
                          </a>
                      </header>
                      <main class="main-container">
                          <section class="content-wrapper">
                              <div class="title-wrapper"><h1 class="title">Create your account</h1></div>
                              <div class="login-container">
                                  <form id="manageAccountForm0" action="/register" method="POST">
                                      <div class="input-wrapper" id="cdkeyWrapper">
                                          <input
                                              class="email-input"
                                              inputmode="text"
                                              type="text"
                                              id="cdkey"
                                              name="cdkey"
                                              autocomplete="off"
                                              autocapitalize="none"
                                              spellcheck="false"
                                              required
                                              placeholder=" "
                                          />
                                          <label class="email-label" for="cdkey">CDKEY</label>
                                      </div>
                                      <div class="input-wrapper" id="usernameWrapper" style="display: none;">
                                      <input
                                          class="email-input"
                                          inputmode="text"
                                          type="text"
                                          id="username"
                                          name="username"
                                          autocomplete="off"
                                          autocapitalize="none"
                                          spellcheck="false"
                                          placeholder=" "
                                          required
                                      />
                                      <label class="email-label" for="username">Your Username</label>
                                    </div>
                                      <input type="hidden" id="cf-turnstile-response" name="cf-turnstile-response" required>
                                      <button class="continue-btn" type="button" id="continueBtn">Continue</button>
                                      <div class="cf-turnstile" data-sitekey="${turnstileSiteKey}" data-callback="onTurnstileCallback"></div>
                                  </form>
          
                                  <div class="divider-wrapper"><span class="divider">Or</span></div>
                                  <p class="other-page">Already have an account? <a class="other-page-link" href="https://${WorkerURL}">Login</a></p>
                              </div>
                          </section>
                      </main>
                  </div>
              </div>
              <script>
              if ('${removeTurnstile}') {
       document.getElementById('cf-turnstile-response').value= "111";
      }
                  document.addEventListener('DOMContentLoaded', function() {
                      const cdkeyInput = document.getElementById('cdkey');
                      const usernameWrapper = document.getElementById('usernameWrapper');
                      const continueBtn = document.getElementById('continueBtn');
                      const manageAccountForm = document.getElementById('manageAccountForm0');
          
                      continueBtn.addEventListener('click', function() {
                          if (cdkeyInput.value.trim() && usernameWrapper.style.display === 'none') {
                              usernameWrapper.style.display = 'block';
                          } else if (cdkeyInput.value.trim() && usernameWrapper.style.display === 'block') {
                              const usernameInput = document.getElementById('username');
                              if (usernameInput.value.trim() && document.getElementById('cf-turnstile-response').value) {
                                  manageAccountForm.submit();
                              } else if (!document.getElementById('cf-turnstile-response').value) {
                                  alert('Please complete the verification.');
                              } else {
                                  alert('Please enter your username.');
                              }
                          }
                      });
          
                      manageAccountForm.addEventListener('submit', function(event) {
                          if (!document.getElementById('cf-turnstile-response').value) {
                              alert('Please complete the verification.');
                              event.preventDefault();
                          }
                      });
                  });
          
                  function onTurnstileCallback(token) {
                      document.getElementById('cf-turnstile-response').value = token;
                  }
              <\/script>
              <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer><\/script>
          </body>
          </html>
  `;
  }
  var MAX_USERS_PER_BATCH = 5;
  async function handleUsageRequest(request) {
    if (request.method === "POST") {
      const url = new URL(request.url);
      if (url.pathname === "/usage/save") {
        const usersData = await request.json();
        await saveUsageLogs(usersData);
        return new Response("Data saved successfully.", { status: 200 });
      } else {
        const formData = await request.formData();
        const adminUsername = formData.get("adminusername");
        const queryType = formData.get("queryType");
        const turnstileResponse = formData.get("cf-turnstile-response");
        const adminUsers = await KV.get("Admin");
        if (!await verifyTurnstile(turnstileResponse)) {
          return generateUsageResponse("Turnstile verification failed");
        }
        if (adminUsers.split(",").includes(adminUsername)) {
          const logs = queryType === "plus" ? ["PlusLoginLogs"] : ["FreeLoginLogs"];
          let usersData = [];
          let uniqueUsers = /* @__PURE__ */ new Set();
          for (const log of logs) {
            const loginLogs = await KV.get(log);
            if (loginLogs) {
              const logArray = JSON.parse(loginLogs);
              const chinaTimeZone = "Asia/Shanghai";
              const today = (/* @__PURE__ */ new Date()).toLocaleDateString("en-US", { timeZone: chinaTimeZone });
              const yesterday = new Date((/* @__PURE__ */ new Date()).setDate((/* @__PURE__ */ new Date()).getDate() - 1)).toLocaleDateString("en-US", { timeZone: chinaTimeZone });
              const recentLogs = logArray.filter((log2) => {
                const logDate = new Date(log2.timestamp).toLocaleDateString("en-US", { timeZone: chinaTimeZone });
                return logDate === today || logDate === yesterday;
              });
              recentLogs.forEach((logEntry) => uniqueUsers.add(logEntry.user));
            }
          }
          const usersArray = Array.from(uniqueUsers);
          for (let i = 0; i < usersArray.length; i += MAX_USERS_PER_BATCH) {
            const batchUsers = usersArray.slice(i, i + MAX_USERS_PER_BATCH);
            const batchUsersData = await processBatchUsers(batchUsers, queryType);
            usersData = usersData.concat(batchUsersData);
          }
          const htmlResponse = await generateTableHTML(usersData, queryType);
          return new Response(htmlResponse, { headers: { "Content-Type": "text/html" } });
        } else {
          const accountNumber = await getTableToCheckAccountNumber(adminUsername, queryType);
          const accessToken = await KV.get(`at_${accountNumber}`) || "1";
          const shareToken = await getToCheckShareToken(adminUsername, accessToken);
          const queryLimit = await handleQueryRequest(accessToken, shareToken);
          return generateUsageResponse(`User: ${adminUsername}, AN: ${accountNumber}, ${queryLimit}`);
        }
      }
    } else {
      return new Response(await getTableUserHTML(), { headers: { "Content-Type": "text/html" } });
    }
  }
  async function processBatchUsers(users, queryType) {
    const usersData = await Promise.all(users.map((user) => processSingleUser(user, queryType).catch((error) => {
      console.error(`Error processing user ${user}:`, error);
      return {
        user,
        accountNumber: "Unknown",
        queryType,
        gpt4: "Error",
        gpt35: "Error"
      };
    })));
    return usersData;
  }
  async function processSingleUser(user, queryType) {
    const accountNumber = await getTableToCheckAccountNumber(user, queryType);
    const accessToken = await KV.get(`at_${accountNumber}`) || "1";
    const shareToken = await getToCheckShareToken(user, accessToken);
    const usage = await queryLimits(accessToken, shareToken);
    return {
      user,
      accountNumber,
      queryType,
      ...parseUsage(usage)
    };
  }
  function parseUsage(usage) {
    return {
      gpt4: usage.gpt4Limit !== void 0 ? usage.gpt4Limit : "N/A",
      gpt35: usage.gpt35Limit !== void 0 ? usage.gpt35Limit : "N/A"
    };
  }
  async function getTableToCheckAccountNumber(userName2, queryType) {
    const logs = queryType === "plus" ? ["PlusLoginLogs"] : ["FreeLoginLogs"];
    const lastLoginLogs = await KV.get(logs);
    if (lastLoginLogs) {
      const logArray = JSON.parse(lastLoginLogs);
      const userLogs = logArray.filter((log) => log.user === userName2);
      if (userLogs.length > 0) {
        const lastAccount = userLogs[userLogs.length - 1].accountNumber;
        return lastAccount;
      }
    }
    return "Unknown";
  }
  async function saveUsageLogs(usersData) {
    const queryType = usersData[0].queryType;
    const logType = queryType === "plus" ? "PlusUsageLogs" : "FreeUsageLogs";
    const currentLogs = await KV.get(logType);
    const logs = currentLogs ? JSON.parse(currentLogs) : [];
    const chinaTime = (/* @__PURE__ */ new Date()).toLocaleString("en-US", { timeZone: "Asia/Shanghai" });
    logs.push({ timestamp: chinaTime, usersData });
    await KV.put(logType, JSON.stringify(logs));
  }
  async function getTableUserHTML() {
    const removeTurnstile = "";//await KV.get("RemoveTurnstile") || "";
    const turnstileSiteKey = await KV.get("TurnstileSiteKey");
    return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Query User Usage</title>
    <style>
      body {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        background-color: #f2f2f5;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        margin: 0;
      }
      .login-container {
        background-color: #ffffff;
        padding: 40px;
        border-radius: 12px;
        box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
        max-width: 400px;
        width: 100%;
        text-align: center;
      }
      .login-container h1 {
        margin-bottom: 24px;
        font-size: 28px;
        color: #333;
        font-weight: 600;
      }
      .login-container label {
        display: block;
        font-size: 16px;
        margin-bottom: 8px;
        color: #555;
        text-align: left;
      }
      .login-container input, .login-container select, .login-container button {
        padding: 12px;
        border: 1px solid #ddd;
        border-radius: 8px;
        font-size: 16px;
        box-sizing: border-box;
        width: 100%;
        margin-bottom: 20px;
      }
      .login-container select {
        height: 48px;
      }
      .login-container .button-group {
        display: flex;
        justify-content: space-between;
      }
      .login-container .button-group button {
        width: 48%;
      }
      .login-container button {
        background-color: #007aff;
        border: none;
        color: white;
        font-size: 18px;
        cursor: pointer;
        transition: background-color 0.3s;
      }
      .login-container button:hover {
        background-color: #005fcb;
      }
      .ulp-field.ulp-error .ulp-error-info {
        margin-top: 4px;
        margin-bottom: 4px;
        display: flex;
        font-size: 14px;
        line-height: 1.4;
        text-align: left;
        color: #d00e17;
    }
    .ulp-input-error-icon {
        margin-right: 4px;
    }
    </style>
  </head>
  <body>
    <div class="login-container">
      <h1>Query User Usage</h1>
      <form id="queryUsageForm" action="/usage" method="POST">
        <input type="hidden" id="cf-turnstile-response" name="cf-turnstile-response" required>
        <label for="adminusername">Admin Username:</label>
        <input type="password" id="adminusername" name="adminusername">
        <div class="button-group">
          <button type="submit" name="queryType" value="plus">Plus Usage</button>
          <button type="submit" name="queryType" value="free">Free Usage</button>
        </div>
        <div style="height: 20px;"></div>
        <div class="cf-turnstile" data-sitekey="${turnstileSiteKey}" data-callback="onTurnstileCallback"></div>
      </form>
    </div>
    <script>
    if ('${removeTurnstile}') {
       document.getElementById('cf-turnstile-response').value= "111";
      }
    function onTurnstileCallback(token) {
      document.getElementById('cf-turnstile-response').value = token;
    }
  
    document.getElementById('queryUsageForm').addEventListener('submit', function(event) {
      if (!document.getElementById('cf-turnstile-response').value) {
        alert('Please complete the verification.');
        event.preventDefault();
      }
    });
    <\/script>
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer><\/script>
  </body>
  </html>
  `;
  }
  async function generateUsageResponse(message) {
    const errorHtml = `
    <div class="ulp-field ulp-error">
      <div class="ulp-error-info">
        <span class="ulp-input-error-icon" role="img" aria-label="Error"></span>
        ${message}
      </div>
    </div>
  `;
    const html = await getTableUserHTML();
    const responseHtml = html.replace(
      '<div class="button-group">',
      errorHtml + '<div class="button-group">'
    );
    return new Response(responseHtml, { headers: { "Content-Type": "text/html" } });
  }
  async function generateTableHTML(usersData, queryType) {
    // const logourl = await KV.get("LogoURL") || logo;
    const logourl = logo;
    const pageTitle = "Usage Chart";
    const historyData = await getHistoryData(queryType);
    let combinedData = combineData(usersData, historyData);
    let headerRow = generateHeaderRow(historyData);
    let timestampRow = generateTimestampRow(historyData);
    let rows = combinedData.map((user) => `
  <tr class="user-row">
    <td class="user-sticky user-name">${user.user}</td>
    ${user.historyUsage.map((usage) => `<td>${usage.gpt4}</td><td>${usage.gpt35}</td>`).join("")}
    <td>${user.realTimeUsage.gpt4}</td>
    <td>${user.realTimeUsage.gpt35}</td>
  </tr>`).join("");
    return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>User Usage</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        margin: 0;
        padding: 0;
        background-color: #f2f2f5;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .header {
        display: flex;
        align-items: center;
        margin: 20px;
        width: 80%;
      }
      .logo {
        height: 50px;
        margin-right: 20px;
      }
      .title {
        font-size: 24px;
        font-weight: bold;
      }
      .table-container {
        width: 80%;
        overflow-x: auto;
        margin: 20px 0;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        font-size: 18px;
        text-align: left;
        position: relative;
        min-width: 800px;
      }
      th, td {
        padding: 12px;
        border: 1px solid #ddd;
      }
      th {
        background-color: #007aff;
        color: white;
      }
      .button-group {
        position: absolute;
        top: 20px;
        right: 20px;
      }
      .button {
        margin-left: 10px;
        padding: 5px 10px;
        background-color: #007aff;
        color: white;
        border: none;
        cursor: pointer;
        font-size: 14px;
        border-radius: 5px;
      }
      .user-name.masked {
        filter: blur(5px);
      }
      th.user-sticky, td.user-sticky {
        position: sticky;
        left: 0;
        color: white;
        background-color: #007aff;
        z-index: 100;
      }
    </style>
  </head>
  <body>
    <div class="header">
      <img src="${logourl}" alt="Logo" class="logo">
      <div class="title">${pageTitle}</div>
    </div>
    <div class="button-group">
      <button class="button" onclick="toggleMask()">Mask/Unmask</button>
      <button class="button" onclick="saveData()">Save</button>
    </div>
    <div class="table-container">
      <table>
      <tr>
      <th class="user-sticky">User</th>
      ${timestampRow}
      <th colspan="2">Real-Time Usage</th>
    </tr>
    <tr>
      <th class="user-sticky"></th>
      ${headerRow}
      <th>GPT-4</th>
      <th>GPT-3.5</th>
    </tr>
        ${rows}
      </table>
    </div>
    <script>
      let isMasked = false;
  
      function toggleMask() {
        isMasked = !isMasked;
        const userNames = document.querySelectorAll('.user-name');
        userNames.forEach(userName => {
          if (isMasked) {
            userName.classList.add('masked');
          } else {
            userName.classList.remove('masked');
          }
        });
      }
  
      function saveData() {
        fetch('/usage/save', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(${JSON.stringify(usersData)})
        })
        .then(response => response.text())
        .then(result => alert(result))
        .catch(error => console.error('Error:', error));
      }
  
      document.querySelectorAll('.user-row').forEach(row => {
        row.addEventListener('mouseover', function() {
          if (isMasked) {
            this.querySelector('.user-name').classList.remove('masked');
          }
        });
        row.addEventListener('mouseout', function() {
          if (isMasked) {
            this.querySelector('.user-name').classList.add('masked');
          }
        });
      });
    <\/script>
  </body>
  </html>
  
  `;
  }
  function generateHeaderRow(historyData) {
    return historyData.map((h) => `<th>GPT-4</th><th>GPT-3.5</th>`).join("");
  }
  function generateTimestampRow(historyData) {
    return historyData.map((h) => `<th colspan="2">${h.timestamp}</th>`).join("");
  }
  async function getHistoryData(queryType) {
    const logType = queryType === "plus" ? "PlusUsageLogs" : "FreeUsageLogs";
    const historyLogs = await KV.get(logType);
    return historyLogs ? JSON.parse(historyLogs) : [];
  }
  function combineData(usersData, historyData) {
    let combinedData = [];
    let allUsers = new Set(usersData.map((u) => u.user).concat(historyData.flatMap((h) => h.usersData.map((u) => u.user))));
    allUsers.forEach((user) => {
      let historyUsage = historyData.map((h) => {
        let userUsage = h.usersData.find((u) => u.user === user);
        return userUsage ? { gpt4: userUsage.gpt4, gpt35: userUsage.gpt35 } : { gpt4: "", gpt35: "" };
      });
      let realTimeUsage = usersData.find((u) => u.user === user);
      combinedData.push({
        user,
        historyUsage,
        realTimeUsage: realTimeUsage ? { gpt4: realTimeUsage.gpt4, gpt35: realTimeUsage.gpt35 } : { gpt4: "", gpt35: "" }
      });
    });
    return combinedData;
  }
  async function handleLoginGetRequest(request) {
    // const url = new URL(request.url);
    // const params = new URLSearchParams(url.search);
    // const userName2 = params.get("un");
    const setan = await KV.get("SetAN");
    // const accountNumber = params.get("an-custom") || params.get("an") || "1";
    // if (userName2) {
    //   return await handleLogin(userName2, accountNumber, "do not need Turnstle", "");
    // } else {
      
    const html = await getLoginHTML(setan);
    return new Response(html, { headers: { "Content-Type": "text/html" } });
    // }
  }
  async function randomAliveAccountOptions() {
    const plusAliveAccountString = await KV.get("PlusAliveAccounts") || "";
    const freeAliveAccountString = await KV.get("FreeAliveAccounts") || "";
    const aliveAccountString = `${plusAliveAccountString},${freeAliveAccountString}`.replace(/^,|,$/g, "");
    const aliveAccounts = aliveAccountString.split(",").map((num) => parseInt(num, 10)).filter((num) => !isNaN(num));
    
    if (aliveAccounts.length === 0) {
      return "1"; // 或者返回其他适当的值来表示没有有效数字
    }
    
    const randomIndex = Math.floor(Math.random() * aliveAccounts.length);
    return aliveAccounts[randomIndex].toString();
  }
  async function handleLoginPostRequest(request) {
    const formData = await request.formData();
    const userName2 = formData.get("un");
    const anissues = formData.get("anissues") === "on";
    const accountNumber = formData.get("an-custom") || formData.get("an") || randomAliveAccountOptions();
    const turnstileResponse = formData.get("cf-turnstile-response");
    return await handleLogin(userName2, accountNumber, turnstileResponse, anissues);
  }
  function isTokenExpired(token) {
    if (!token || token === "Bad_RT" || token === "Bad_AT") {
      return true;
    }
    const payload = parseJwt(token);
    const currentTime = Math.floor(Date.now() / 1e3);
    return payload.exp < currentTime;
  }
  async function getOAuthLink(shareToken, proxiedDomain) {
    const url = `https://new.oaifree.com/api/auth/oauth_token`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Origin": `https://${proxiedDomain}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        share_token: shareToken
      })
    });
    const data = await response.json();
    return data.login_url;
  }
  async function getShareToken(userName2, accessToken, accountNumber) {
    const url = "https://chat.oaifree.com/token/register";
    const isAdmin = await usermatch(userName2, "Admin") || userName2 == "atdirect";
    // const isTemporary = await usermatch(accountNumber, "TemporaryAN") && !isAdmin;
    const passwd = await generatePassword(userName2);
    const body = new URLSearchParams({
      access_token: accessToken,
      // 使用从全局变量中获取的 accessToken
      unique_name: passwd,
      //前缀+无后缀用户名
      site_limit: "",
      // 限制的网站
      expires_in:  "0",
      // token有效期（单位为秒），填 0 则永久有效
      gpt35_limit: "-1",
      // gpt3.5 对话限制
      gpt4_limit:  "-1",
      // gpt4 对话限制，-1为不限制
      show_conversations: isAdmin ? "true" : "false",
      // 是否显示所有人的会话
      temporary_chat:  "false",
      //默认启用临时聊天
      show_userinfo: isAdmin ? "true" : "false",
      // 是否显示用户信息
      reset_limit: "false"
      // 是否重置对话限制
    }).toString();
    const apiResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });
    const responseText = await apiResponse.text();
    const tokenKeyMatch = /"token_key":"([^"]+)"/.exec(responseText);
    const tokenKey = tokenKeyMatch ? tokenKeyMatch[1] : "Can not get share token.";
    return tokenKey;
  }
  async function handleLogin(userName2, initialaccountNumber, turnstileResponse, anissues) {
    if (turnstileResponse !== "do not need Turnstle" && (!turnstileResponse || !await verifyTurnstile(turnstileResponse))) {
      return generateLoginResponse("Turnstile verification failed");
    }
    const proxiedDomain = myWorkerURL;//await KV.get("WorkerURL");
    const status = await KV.get("Status");
    const GPTState = await getGPTStatus();
    if (GPTState == "major_performance" && !status) {
      await loginlog(userName2, "Bad_OAIStatus", "Error");
      return generateLoginResponse(`OpenAI service is under maintenance.<br>Official status: ${GPTState} <br>More details: https://status.openai.com`);
    }
    // try {
    //   const tokenData = JSON.parse(userName2);
    //   if (tokenData.accessToken) {
    //     const jsonAccessToken = tokenData.accessToken;
    //     const shareToken2 = await getShareToken("atdirect", jsonAccessToken, "0");
    //     if (shareToken2 === "Can not get share token.") {
    //       return generateLoginResponse("Error fetching share token.");
    //     }
    //     return Response.redirect(await getOAuthLink(shareToken2, proxiedDomain), 302);
    //   }
    // } catch (e) {
    // }
    if (userName2.length > 50) {
      const shareToken2 = await getShareToken("atdirect", userName2, "0");
      if (shareToken2 === "Can not get share token.") {
        return generateLoginResponse("Error fetching share token.");
      }
      return Response.redirect(await getOAuthLink(shareToken2, proxiedDomain), 302);
    }
    if (userName2.startsWith("fk-")) {
      const shareToken2 = userName2;
      return Response.redirect(await getOAuthLink(shareToken2, proxiedDomain), 302);
    }
    const userRegex = new RegExp(`^${userName2}_(\\d+)$`);
    let fullUserName = userName2;
    let foundSuffix = false;
    let suffix = "";
    const forcean = await KV.get("ForceAN");
    const defaultusers = await KV.get("Users") || "";
    const freeusers = await KV.get("FreeUsers") || "";
    const admin = await KV.get("Admin") || "";
    const users = `${defaultusers},${freeusers},${admin}`;
    users.split(",").forEach((user) => {
      const match = user.match(userRegex);
      if (match) {
        foundSuffix = true;
        suffix = match[1];
        fullUserName = user;
      }
    });
    if (!foundSuffix && !users.split(",").includes(userName2)) {
      await loginlog(userName2, "Bad_PW", "Error");
      return generateLoginResponse("Unauthorized access.");
    }
    // if (!users.split(",").includes(fullUserName)) {
    //   await loginlog(userName2, "Bad_PW", "Error");
    //   return generateLoginResponse("Unauthorized access.");
    // }
    const setan = await KV.get("SetAN");
    let antype = "Plus";
    let mode = "";
    let accountNumber = "";
    if (foundSuffix && forcean === "1") {
      accountNumber = await getAccountNumber(fullUserName, suffix, antype, "Check", anissues);
    } else {
      if (setan == "True") {
        const plusmode = await KV.get("PlusMode");
        const freemode = await KV.get("FreeMode");
        antype = "Plus";
        mode = plusmode;
        if (freemode !== "Plus") {
          if (freeusers.split(",").includes(fullUserName)) {
            antype = "Free";
            mode = freemode;
          }
        }
        accountNumber = await getAccountNumber(fullUserName, initialaccountNumber, antype, mode, anissues);
      } else if (setan) {
        accountNumber = await getAccountNumber(fullUserName, setan, antype, "Check", anissues);
      } else {
        accountNumber = await getAccountNumber(fullUserName, initialaccountNumber, antype, "Check", anissues);
      }
    }
    const refreshTokenKey = `rt_${accountNumber}`;
    const accessTokenKey = `at_${accountNumber}`;
    const accessToken = await KV.get(accessTokenKey);
    if (accessToken) {
      if (accessToken.startsWith("fk-")) {
        const fkDomain = await KV.get("FKDomain") || proxiedDomain;
        return Response.redirect(`https://${fkDomain}/auth/login_share?token=${accessToken}`);
      }
    }
    if (isTokenExpired(accessToken)) {
      const url = "https://token.oaifree.com/api/auth/refresh";
      const refreshToken = await KV.get(refreshTokenKey);
      if (refreshToken) {
        const response2 = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
          },
          body: `refresh_token=${refreshToken}`
        });
        if (response2.ok) {
          const data = await response2.json();
          const newAccessToken = data.access_token;
          await KV.put(accessTokenKey, newAccessToken);
        } else {
          await KV.put(accessTokenKey, "Bad_RT");
          await loginlog(fullUserName, `Bad RT_${accountNumber}`, "Error");
          return generateLoginResponse("Error fetching access token.");
        }
      } else {
        return generateLoginResponse("The current access token has not been updated.");
      }
    }
    const finalaccessToken = await KV.get(accessTokenKey);
    const shareToken = await getShareToken(fullUserName, finalaccessToken, accountNumber);
    if (shareToken === "Can not get share token.") {
      await loginlog(fullUserName, `Bad AT_${accountNumber}`, "Error");
      return generateLoginResponse("Error fetching share token.");
    }
    await loginlog(fullUserName, accountNumber, antype);
    const oauthLink = await getOAuthLink(shareToken, proxiedDomain);

    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 7);
    const expires = expirationDate.toUTCString();
    
    const headers = new Headers();
    headers.append("Location", oauthLink);
    headers.append("Set-Cookie", `aian=${accountNumber}; Expires=${expires};Path=/`);
    headers.append("Set-Cookie", `username=${fullUserName}; Expires=${expires};Path=/`);
    const response = new Response(null, {
      status: 302,
      headers
    });
    return response;
  }
  async function loginlog(userName2, accountNumber, antype) {
    const currentTime = (/* @__PURE__ */ new Date()).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    const timestamp = Date.now();
    const logEntry = {
      user: userName2,
      accountNumber,
      time: currentTime,
      timestamp
    };
    const lastLoginLogs = await KV.get(`${antype}LoginLogs`);
    let logArray = [];
    if (lastLoginLogs) {
      logArray = JSON.parse(lastLoginLogs);
    }
    logArray.push(logEntry);
    await KV.put(`${antype}LoginLogs`, JSON.stringify(logArray));
  }
  async function deletelog(userName2, accountNumber, antype) {
    const currentTime = (/* @__PURE__ */ new Date()).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    const logEntry = {
      user: userName2,
      time: currentTime,
      accountNumber
    };
    const lastDeleteLogs = await KV.get(`${antype}DeleteLogs`);
    let logArray = [];
    if (lastDeleteLogs) {
      logArray = JSON.parse(lastDeleteLogs);
    }
    logArray.push(logEntry);
    await KV.put(`${antype}DeleteLogs`, JSON.stringify(logArray));
  }
  async function getAccountNumber(userName2, initialaccountNumber, antype, mode, anissues) {
    if (mode == "Check") {
      // await checkAndRemoveIssueAccount(initialaccountNumber);
      return initialaccountNumber;
    }
    const currentTime = Date.now();
    const Milliseconds = 3 * 60 * 1e3;
    const checkAndRemoveIssueAccount = async (accountNumber) => {
      const lastLoginLogs = await KV.get(`${antype}LoginLogs`);
      if (lastLoginLogs) {
        const logArray = JSON.parse(lastLoginLogs);
        const userLogs = logArray.filter((log) => log.user === userName2 && log.accountNumber === accountNumber);
        if (userLogs.length > 0) {
          const recentLogins = userLogs.filter((log) => {
            const logTime = log.timestamp;
            return currentTime - logTime <= Milliseconds;
          });
          if (recentLogins.length >= 1 && anissues) {
            const aliveAccount = await KV.get(`${antype}AliveAccounts`);
            let aliveAccountList = aliveAccount.split(",");
            aliveAccountList = aliveAccountList.filter((acc) => acc !== accountNumber.toString());
            await KV.put(`${antype}AliveAccounts`, aliveAccountList.join(","));
            await deletelog(userName2, accountNumber, antype);
            return true;
          }
        }
      }
      return false;
    };
    if (mode == "Order") {
      const aliveAccountString = await KV.get(`${antype}AliveAccounts`) || "";
      let aliveAccounts = aliveAccountString.split(",").map((num) => parseInt(num, 10)).filter((num) => !isNaN(num));
      if (aliveAccounts.length > 0) {
        let minAccount = Math.min(...aliveAccounts);
        if (await checkAndRemoveIssueAccount(minAccount)) {
          aliveAccounts = aliveAccounts.filter((acc) => acc !== minAccount);
          minAccount = aliveAccounts.length > 0 ? Math.min(...aliveAccounts) : 1;
        }
        return minAccount;
      }
      return 1;
    }
    if (mode == "Random") {
      const lastLoginLogs = await KV.get(`${antype}LoginLogs`);
      if (lastLoginLogs) {
        const logArray = JSON.parse(lastLoginLogs);
        const userLogs = logArray.filter((log) => log.user === userName2);
        const recentLogins = userLogs.filter((log) => {
          const logTime = log.timestamp;
          return currentTime - logTime <= Milliseconds;
        });
        if (recentLogins.length > 0) {
          const lastAccount = recentLogins[recentLogins.length - 1].accountNumber;
          if (await checkAndRemoveIssueAccount(lastAccount)) {
            const aliveAccountString2 = await KV.get(`${antype}AliveAccounts`) || "";
            const aliveAccounts2 = aliveAccountString2.split(",").map((num) => parseInt(num, 10)).filter((num) => !isNaN(num));
            if (aliveAccounts2.length > 0) {
              const randomAccount = aliveAccounts2[Math.floor(Math.random() * aliveAccounts2.length)];
              return randomAccount;
            }
            return 0;
          }
          return lastAccount;
        }
      }
      const aliveAccountString = await KV.get(`${antype}AliveAccounts`) || "";
      let aliveAccounts = aliveAccountString.split(",").map((num) => parseInt(num, 10)).filter((num) => !isNaN(num));
      if (aliveAccounts.length > 0) {
        let randomAccount = aliveAccounts[Math.floor(Math.random() * aliveAccounts.length)];
        if (await checkAndRemoveIssueAccount(randomAccount)) {
          aliveAccounts = aliveAccounts.filter((acc) => acc !== randomAccount);
          if (aliveAccounts.length > 0) {
            randomAccount = aliveAccounts[Math.floor(Math.random() * aliveAccounts.length)];
            return randomAccount;
          }
          return 0;
        }
        return randomAccount;
      }
      return 0;
    }
    return initialaccountNumber;
  }
  async function generateLoginResponse(message) {
    const setan = await KV.get("SetAN");
    const errorHtml = `
   <div class="ulp-field ulp-error">
     <div class="ulp-error-info">
       <span class="ulp-input-error-icon" role="img" aria-label="Error"></span>
       ${message}
     </div>
   </div>
   `;
    const html = await getLoginHTML(setan);
    const responseHtml = html.replace(
      '<button class="continue-btn" type="submit">Continue</button>',
      errorHtml + '<button class="continue-btn" type="submit">Continue</button>'
    );
    return new Response(responseHtml, { headers: { "Content-Type": "text/html" } });
  }
  async function getAliveAccountOptions() {
    const plusAliveAccountString = await KV.get("PlusAliveAccounts") || "";
    const freeAliveAccountString = await KV.get("FreeAliveAccounts") || "";

    const plusAliveAccounts = plusAliveAccountString.split(",").map(num => ({
        num: parseInt(num, 10),
        type: 'plus'
    })).filter(account => !isNaN(account.num));

    const freeAliveAccounts = freeAliveAccountString.split(",").map(num => ({
        num: parseInt(num, 10),
        type: 'free'
    })).filter(account => !isNaN(account.num));

    const aliveAccounts = plusAliveAccounts.concat(freeAliveAccounts);

    return aliveAccounts.map(account => `<option value="${account.num}">${account.type}${account.num}</option>`).join("");
}

  async function getGPTStatus() {
    const url = "https://status.openai.com/api/v2/summary.json";
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
      }
    });
    if (response.ok) {
      const data = await response.json();
      const status = data.components.find((component) => component.name === "ChatGPT");
      return status.status;
    } else {
      return "operational";
    }
  }
  async function getLoginHTML(setan) {
    const WorkerURL = myWorkerURL;//await KV.get("WorkerURL");
    const turnstileSiteKey = await KV.get("TurnstileSiteKey");
    const websiteName = await KV.get("WebName") || "Haibara AI";
    // const logourl = await KV.get("LogoURL") || logo;
    const logourl = logo;
    const removeTurnstile = "";//await KV.get("RemoveTurnstile") || "";
    const commonHTML = `
     <!DOCTYPE html>
     <html lang="en">
     <head>
         <meta charset="UTF-8">
         <link rel="apple-touch-icon" sizes="180x180" href="https://cdn1.oaifree.com/_next/static/media/apple-touch-icon.82af6fe1.png"/>
         <link rel="icon" type="image/png" sizes="32x32" href="https://cdn4.oaifree.com/_next/static/media/favicon-32x32.630a2b99.png"/>
         <link rel="icon" type="image/png" sizes="16x16" href="https://cdn4.oaifree.com/_next/static/media/favicon-16x16.a052137e.png"/>
         <meta name="viewport" content="width=device-width, initial-scale=1.0">
         <title>Login - ${websiteName}</title>
         <style>
             @charset "UTF-8";
             .oai-header img {
                 height: auto;
                 width: 128px;
                 margin-top: 50px;
             }
 
             a {
                 font-weight: 400;
                 text-decoration: inherit;
                 color: #10a37f;
             }
 
             .main-container {
                 flex: 1 0 auto;
                 min-height: 0;
                 display: grid;
                 box-sizing: border-box;
                 grid-template-rows: [left-start center-start right-start] 1fr [left-end center-end right-end];
                 grid-template-columns: [left-start center-start] 1fr [left-end right-start] 1fr [center-end right-end];
                 align-items: center;
                 justify-content: center;
                 justify-items: center;
                 grid-column-gap: 160px;
                 column-gap: 160px;
                 padding: 80px;
                 width: 100%;
             }
 
             .login-container {
                 background-color: #fff;
                 padding: 0 40px 40px;
                 border-radius: 3px;
                 box-shadow: none;
                 width: 320px;
                 box-sizing: content-box;
                 flex-shrink: 0;
             }
 
             .title-wrapper {
                 padding: 0 40px 24px;
                 box-sizing: content-box;
                 text-align: center;
             }
 
             .title {
                 font-size: 32px;
                 font: 'S\xF6hne';
                 margin: 0;
                 color: #2d333a;
                 width: 320px;
             }
 
             .input-wrapper {
                 position: relative;
                 margin-bottom: 10px;
                 width: 320px;
                 box-sizing: content-box;
             }
 
             .email-input {
                 -webkit-appearance: none;
                 -moz-appearance: none;
                 appearance: none;
                 background-color: #fff;
                 border: 1px solid #c2c8d0;
                 border-radius: 6px;
                 box-sizing: border-box;
                 color: #2d333a;
                 font-family: inherit;
                 font-size: 16px;
                 height: 52px;
                 line-height: 1.1;
                 outline: none;
                 padding-block: 1px;
                 padding-inline: 2px;
                 padding: 0 16px;
                 transition:
                     box-shadow 0.2s ease-in-out,
                     border-color 0.2s ease-in-out;
                 width: 100%;
                 text-rendering: auto;
                 letter-spacing: normal;
                 word-spacing: normal;
                 text-transform: none;
                 text-indent: 0px;
                 text-shadow: none;
                 display: inline-block;
                 text-align: start;
                 margin: 0;
             }
 
             .email-input:focus,
             .email-input:valid {
                 border: 1px solid #10a37f;
                 outline: none;
             }
 
             .email-input:focus-within {
                 box-shadow: 1px #10a37f;
             }
 
             .email-input:focus + .email-label,
             .email-input:valid + .email-label {
                 font-size: 14px;
                 top: 0;
                 left: 10px;
                 color: #10a37f;
                 background-color: #fff;
             }
 
             .email-label {
                 position: absolute;
                 top: 26px;
                 left: 16px;
                 background-color: #fff;
                 color: #6f7780;
                 font-size: 16px;
                 font-weight: 400;
                 margin-bottom: 8px;
                 max-width: 90%;
                 overflow: hidden;
                 pointer-events: none;
                 padding: 1px 6px;
                 text-overflow: ellipsis;
                 transform: translateY(-50%);
                 transform-origin: 0;
                 transition:
                     transform 0.15s ease-in-out,
                     top 0.15s ease-in-out,
                     padding 0.15s ease-in-out;
                 white-space: nowrap;
                 z-index: 1;
             }
 
             .continue-btn {
                 position: relative;
                 height: 52px;
                 width: 320px;
                 background-color: #10a37f;
                 color: #fff;
                 margin: 10px 0 0;
                 align-items: center;
                 justify-content: center;
                 display: flex;
                 border-radius: 6px;
                 padding: 4px 16px;
                 font: inherit;
                 border-width: 0px;
                 cursor: pointer;
             }
             .choose-account {
              -webkit-appearance: none;
              -moz-appearance: none;
              appearance: none;
              background-color: #fff;
              border: 1px solid #c2c8d0;
              border-radius: 6px;
              box-sizing: border-box;
              color: #2d333a;
              font-family: inherit;
              font-size: 16px;
              height: 52px;
              line-height: 1.1;
              outline: none;
              padding-block: 1px;
              padding-inline: 2px;
              padding: 0 16px;
              transition:
                  box-shadow 0.2s ease-in-out,
                  border-color 0.2s ease-in-out;
              width: 100%;
              text-rendering: auto;
              letter-spacing: normal;
              word-spacing: normal;
              text-transform: none;
              text-indent: 0px;
              text-shadow: none;
              display: inline-block;
              text-align: start;
              margin: 0;
          }

          .choose-account:focus {
              border: 1px solid #10a37f;
              outline: none;
          }

          .choose-account:focus-within {
              box-shadow: 1px #10a37f;
          }
          .username-label {
                 font-size: 14px;
                 top: 0;
                 left: 10px;
                 color: #10a37f;
                 background-color: #fff;
             }
 
             .continue-btn:hover {
                 box-shadow: inset 0 0 0 150px #0000001a;
             }
 
             :root {
                 font-family:
                     S\xF6hne,
                     -apple-system,
                     BlinkMacSystemFont,
                     Helvetica,
                     sans-serif;
                 line-height: 1.5;
                 font-weight: 400;
                 font-synthesis: none;
                 text-rendering: optimizeLegibility;
                 -webkit-font-smoothing: antialiased;
                 -moz-osx-font-smoothing: grayscale;
             }
 
             .page-wrapper {
                 display: flex;
                 flex-direction: column;
                 justify-content: space-between;
                 min-height: 100%;
             }
 
             .oai-header {
                 display: flex;
                 justify-content: center;
                 align-items: center;
                 width: 100%;
                 background-color: #fff;
             }
 
             body {
                 background-color: #fff;
                 display: block;
                 margin: 0;
             }
 
             .content-wrapper {
                 display: flex;
                 flex-direction: column;
                 align-items: center;
                 justify-content: center;
                 width: 100%;
                 height: auto;
                 white-space: normal;
                 border-radius: 5px;
                 position: relative;
                 grid-area: center;
                 box-shadow: none;
                 vertical-align: baseline;
                 box-sizing: content-box;
             }
 
             .checkbox-wrapper {
                 margin: 20px 0;
                 display: flex;
                 align-items: center;
             }
 
             .checkbox-label {
                 margin-left: 8px;
                 font-weight: 600;
                 color: #6f7780;
                 font-size: 14px;
             }
 
             .help-icon {
                 display: inline-block;
                 margin-left: 5px;
                 color: #10a37f;
                 cursor: pointer;
                 font-weight: bold;
             }
 
             .tooltip {
                 visibility: hidden;
                 min-width: 140px;
                 max-width: 300px;
                 line-height: 20px; 
                 min-height: 90px; 
                 display: flex;
                 align-items: center;
                 justify-content: center;
                 background-color: black;
                 color: #fff;
                 text-align: center;
                 border-radius: 6px;
                 
                 position: absolute;
                 z-index: 1;
                 bottom: 150%;
                 left: 50%;
                 margin-left: -70px; /* Half of the width to center the tooltip */
                 opacity: 0;
                 transition: opacity 0.3s, visibility 0.3s ease-in-out;
             }
 
             .tooltip::after {
                 content: "";
                 position: absolute;
                 top: 100%;
                 left: 50%;
                 margin-left: -5px;
                 border-width: 5px;
                 border-style: solid;
                 border-color: black transparent transparent transparent;
             }
 
 
             .choose-account select {
                 flex: 3;
                 padding: 12px;
                 border: 1px solid #c2c8d0;
                 border-radius: 6px 0 0 6px;
                 font-size: 16px;
             }
 
             .choose-account input[type="number"] {
                 flex: 1;
                 padding: 12px;
                 border: 1px solid #c2c8d0;
                 border-radius: 0 6px 6px 0;
                 font-size: 16px;
             }
 
             .cf-turnstile {
                 display: flex;
                 justify-content: center;
                 margin-top: 10px;
             }
             .other-page {
                 text-align: center;
                 margin-top: 14px;
                 margin-bottom: 0;
                 font-size: 14px;
                 width: 320px;
                 }
                 .divider-wrapper {
                     display: flex;
                     flex-direction: row;
                     text-transform: uppercase;
                     border: none;
                     font-size: 12px;
                     font-weight: 400;
                     margin: 0;
                     padding: 24px 0 0;
                     align-items: center;
                     justify-content: center;
                     width: 320px;
                     vertical-align: baseline;
                     }
                     
                     .divider-wrapper:before {
                         content: "";
                         border-bottom: 1px solid #c2c8d0;
                         flex: 1 0 auto;
                         height: .5em;
                         margin:0
                     }
                      .divider-wrapper:after{
                         content: "";
                         border-bottom: 1px solid #c2c8d0;
                         flex: 1 0 auto;
                         height: .5em;
                         margin:0
                     }
                     .divider {
                         text-align: center;
                         flex: .2 0 auto;
                         margin: 0;
                         height:12px
                     }
                     .checkbox-wrapper {
                         margin: 0px 0;
                         display: flex;
                         align-items: center;
                     }
                     .checkbox-label {
                         margin-left: 8px;
                         font-weight: 400;
                         color: #6f7780;
                         font-size: 14px;
                     }
                     .ulp-field.ulp-error .ulp-error-info {
                       margin-top: 4px;
                       margin-bottom: 4px;
                       display: flex;
                       font-size: 14px;
                       line-height: 1.4;
                       text-align: left;
                       color: #d00e17;
                   }
                   
                   .ulp-input-error-icon {
                       margin-right: 4px;
                   }
                   .ulp-input-error-icon::before {
                       content: "\u{1F6AB}";
                       margin-right: 0px;
                     }
                     .footer {
                      text-align: center;
                      font-size: 12px;
                      padding: 10px;
                  }
          
                  .footer a {
                      color: black;
                      text-decoration: none;
                  }
          
                  .footer a:hover {
                      text-decoration: none;
                      color: black;
                  }
      
             
         </style>
     </head>
     <body>
         <div id="root">
             <div class="page-wrapper">
                 <header class="oai-header">
                     <a href="https://${WorkerURL}/admin">
                         <img src="${logourl}" alt="Logo">
                     </a>
                 </header>
                 <main class="main-container">
                     <section class="content-wrapper">
                         <div class="title-wrapper"><h1 class="title">${websiteName}</h1></div>
                         <div class="login-container">
                             <form id="manageAccountForm0" action="/auth/login_auth0" method="POST">
                                 <div class="input-wrapper">
                                     <input
                                         class="email-input"
                                         inputmode="email"
                                         type="text"
                                         id="un"
                                         name="un"
                                         autocomplete="username"
                                         autocapitalize="none"
                                         spellcheck="false"
                                         required
                                         placeholder=" "
                                     />
                                     <label class="email-label" for="un">Username</label>
                                 </div>`;
    const aliveAccountOptions = await getAliveAccountOptions();
    const accountNumberHTML = `
                                 <div class="input-wrapper">
                                    <label for="an">
                                        <a class="username-label">Account:</a>
                                    </label>
                                    <select id="an" name="an" class="choose-account">
                                      <option value="" selected disabled hidden>Select Account</option>
                                        ${aliveAccountOptions}
                                    </select>
                                 </div>`;
    const commonHTML2 = `
                                <!-- <div class="checkbox-wrapper">
                                     <input type="checkbox" id="an-issues" name="anissues" />
                                     <label class="checkbox-label" for="an-issues">Report Account Issues</label>
                                 </div> -->
                                 <button class="continue-btn" type="submit">Continue</button>
                                 <input type="hidden" id="cf-turnstile-response" name="cf-turnstile-response" required>
                                 <div class="cf-turnstile" data-sitekey="${turnstileSiteKey}" data-callback="onTurnstileCallback"></div>
                             </form>
                             <div class="divider-wrapper"><span class="divider">Or</span></div>
                             <p class="other-page">Don't have an account? <a class="other-page-link" href="https://${WorkerURL}/register">Sign Up</a></p>
                         </div>
                     </section>
                 </main>
             </div>
         </div>
            
         <script>
         if ('${removeTurnstile}') {
       document.getElementById('cf-turnstile-response').value= "111";
      }
             document.addEventListener('DOMContentLoaded', function() {
                 const helpIcon = document.querySelector('.help-icon');
                 const tooltip = document.createElement('div');
                 tooltip.className = 'tooltip';
                 tooltip.textContent = 'Select your account. Chat histories are not shared between accounts. Other users cannot view your chat history.';
                 document.body.appendChild(tooltip);
 
                 helpIcon.addEventListener('mouseover', function() {
                     tooltip.style.visibility = 'visible';
                     tooltip.style.opacity = '1';
                     const rect = helpIcon.getBoundingClientRect();
                     tooltip.style.top = (rect.top - tooltip.offsetHeight - 10) + 'px';
                     tooltip.style.left = (rect.left + rect.width / 2 - tooltip.offsetWidth / 2) + 'px';
                 });
 
                 helpIcon.addEventListener('mouseout', function() {
                     tooltip.style.visibility = 'hidden';
                     tooltip.style.opacity = '0';
                 });
             });
 
             function onTurnstileCallback(token) {
                 document.getElementById('cf-turnstile-response').value = token;
             }
 
             document.getElementById('manageAccountForm0').addEventListener('submit', function(event) {
                 if (!document.getElementById('cf-turnstile-response').value) {
                     alert('Please complete the verification.');
                     event.preventDefault();
                 }
             });
         <\/script>
         <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer><\/script>
     </body>
     </html>`;
    return setan ? commonHTML + commonHTML2 : commonHTML + accountNumberHTML + commonHTML2;
  }
})();
//# sourceMappingURL=_worker.js.map
