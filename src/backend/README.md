# The Backend Code Folder

## Development handoff connection test

`handoff.web.js` exports the visitor-callable `exchangeHandoffToken(token)` connection test using `Permissions.Anyone`. It creates no members or sessions and assigns no roles. Success returns only `{ authorized: true }` and does not grant access to private Support Hub pages; failures from the handler return `Handoff failed` without PHP response details.

Prerequisites:

- An authenticated Wix site administrator with access to the Local Editor for Editor-based testing. This Editor access is separate from the web method's `Permissions.Anyone` permission, which allows ordinary visitors to invoke it. This checkout has no installed dependencies; install the existing dependencies with `npm install`, then use `npm run dev`. Do not publish or push this branch.
- A publicly reachable development PHP API with a valid HTTPS certificate. Localhost and a private local PHP server cannot be reached by Wix's hosted backend.
- In the development site's Secrets Manager, `ErepioApiUrl` must hold the development HTTPS base URL and `ErepioHandoffSecret` must match that development API. Do not repoint production secrets. Set `ErepioHandoffTestEnabled` to the exact string `true` only in the development environment. Missing or disabled configuration fails closed. `HubAccessRoleId` is not used.
- Disposable tokens from the existing PHP development handoff flow: a fresh unused token and a separate expired, unused token. The actual URL, configured secrets, tokens, and expiry duration are not available in this repository.

In Wix Studio or Wix Editor, open the locally synced `backend/handoff.web.js` and use functional testing for `exchangeHandoffToken`. Supply its `token` parameter privately. Wix supports functional testing of exported `.web.js` functions and describes its execution as equivalent to Preview. This capability has not yet been verified on this site.

Run these cases in order:

| Input | Expected result |
| --- | --- |
| Fresh unused development token | `{ "authorized": true }` |
| The same token again | `Handoff failed` |
| A fabricated token of at least 20 characters | `Handoff failed` |
| A separate unused token after its PHP expiry | `Handoff failed` |

Use a sufficiently long invalid token so the invalid-token case reaches PHP instead of only testing local input validation. The fresh-token success is also the check that Wix can reach the configured HTTPS exchange endpoint. Rejection results are meaningful only after that success establishes working configuration. Do not retry the fresh token expecting another success: exchange consumes it.

The request contract remains `POST /api/support-hub/wix/handoff/exchange`, header `X-Wix-Handoff-Secret`, and JSON body `{ token }`. Success requires the existing response fields `authorized: true` and a valid `user.email`; neither email nor PHP response data is returned.

Wix functional testing displays its call arguments. Use disposable development tokens only; do not share or retain raw test output containing them. The backend itself does not log tokens, secrets, or response details. Disable the test flag after testing.

Live test status: not run. Development HTTPS reachability and all four real token outcomes remain unverified until the prerequisites above are available. This tests only the backend connection; private-page authorization must be enforced independently.

This folder contains the backend code files for your site. These files correspond to the ones found in the [**Backend**](https://support.wix.com/en/article/velo-working-with-the-velo-sidebar#backend) section of the **Public & Backend** 
![image](https://user-images.githubusercontent.com/89579857/184862813-e55cdd98-b723-4d64-b73c-593eb9af21c7.png) tab in the Velo sidebar. Add the following files to this folder to include them in your site:
+ [**Web Modules:**](https://support.wix.com/en/article/velo-web-modules-calling-backend-code-from-the-frontend)  
  These are files that allow you to expose functions in your site's backend that you can run in your frontend code. These files require a `.jsw` file extension.
  >**Note:**  
  >You can't change [web module permissions](https://support.wix.com/en/article/velo-about-web-module-permissions) in Wix editors when using Git Integration & Wix CLI. Instead, use the [permissions.json](#permissionsjson) file to set function permissions.

+ **data.js**  
  A file for [adding data hooks](https://support.wix.com/en/article/velo-using-data-hooks) to your site's collections.

+ **routers.js**  
  A file for implementing [routing and sitemap](https://support.wix.com/en/article/velo-about-routers#routing-code) functionality for your site.

+ **events.js**  
  A file for implementing your site's [backend event handlers](https://support.wix.com/en/article/velo-backend-events). 

+ **http-functions.js**  
  A file for implementing [HTTP endpoints](https://www.wix.com/velo/reference/wix-http-functions/introduction) that are exposed on your site.

+ **jobs.config**  
  A file for [scheduling recurring jobs](https://support.wix.com/en/article/velo-scheduling-recurring-jobs). Jobs consist of other backend code that's run at regular intervals.
  
+ **General backend files**  
  JavaScript code files. You can import code from these files into any other backend file on your site. These files require a `.js` file extension.

Use the following syntax to import code from backend files: 
```js 
import { myFunctionName } from 'backend/myFileName';
```  
Trying to import from the relative path in your site's repo doesn't work.

Learn more about [this repo's file structure](https://support.wix.com/en/article/velo-understanding-your-sites-github-repository-beta).

## permissions.json
This file defines [permissions](https://support.wix.com/en/article/velo-about-web-module-permissions) for the functions in your web module files. The file contains a key, `"web-methods"`, whose value is an object that can contain keys named after the web module files in your `backend` folder. Name these keys with the following syntax: `"backend/{path to file}myFile.jsw"`. The value for each file name key is an object that can contain keys named after the functions in that file. Each function key has a value with the following format:
```js
"backend/myFile.jsw": {
  "siteOwner" : {
    "invoke" : // Boolean
  },
  "siteMember" : {
    "invoke" : // Boolean
  },
  "anonymous" : {
    "invoke" : // Boolean
  }  
}
```
These values reflect the different levels of web module function permissions. You can set them using the following options:
| |`siteOwner`|`siteMember`|`anonymous`|
|-|-----------|------------|-----------|
|Owner-only access| `true` | `false` | `false`|
|Site member access| `true` | `true` | `false`|
|Anyone can access| `true` | `true`| `true`|

The `"web-methods"` object must also contain a `"*"` key. The value for this key defines the default permissions that are applied to any function whose permissions you don't set manually.

Here is an example `permissions.json` file for a site with a backend file called `helperFunctions.jsw`. The file's functions are called `calculate`, `fetchData`, and `syncWithServer`. In this case anyone can call `calculate`, site members can call `syncWithServer`, and only site owners can call `fetchData`.

```json
{
  "web-methods": {
    "*": {
      "*": {
        "siteOwner": {
          "invoke": true
        },
        "siteMember": {
          "invoke": true
        },
        "anonymous": {
          "invoke": true
        }
      }
    },
    "backend/helperFunctions.jsw": {
      "calculate": {
        "siteOwner": {
          "invoke": true
        },
        "siteMember": {
          "invoke": true
        },
        "anonymous": {
          "invoke": true
        }
      },
      "fetchData": {
        "siteOwner": {
          "invoke": true
        },
        "siteMember": {
          "invoke": false
        },
        "anonymous": {
          "invoke": false
        }
      },
      "syncWithServer": {
        "siteOwner": {
          "invoke": true
        },
        "siteMember": {
          "invoke": true
        },
        "anonymous": {
          "invoke": false
        }
      }
    }
  }
}
```
