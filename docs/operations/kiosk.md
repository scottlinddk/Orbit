# Wall display and installing the app

Orbit can run on a wall tablet or an old screen, and it can be installed to a phone's home screen.

## Install as an app

Browsers offer "Install" or "Add to Home Screen" only on **HTTPS** (or `localhost`). On plain HTTP over a LAN Orbit still works as a website but is not installable and has no offline shell. See [HTTPS for a home network](hosting/https-lan-and-tailscale.md).

The installed app opens in its own window. A small service worker stores the app shell and static files, so the app opens quickly and shows its sign-in or error screen without a network. It **never stores API answers**: dashboards and household data always come from the server, so signing out leaves nothing behind on the device. Offline, the dashboard cannot load. Each release ships a new service worker, which replaces the old cache the next time the app opens.

The browser's address bar and the installed window's title bar take the color of your theme's background.

## The wall display

Open a dashboard and choose **Wall display**, or go straight to:

```text
https://orbit.example.com/kiosk/<dashboard-id>
```

It shows that one dashboard full screen: no navigation, larger type, no editing. It reloads its data every 60 seconds. After 5 quiet seconds the mouse cursor and the "Exit wall display" link disappear. If the server cannot be reached, it keeps showing the last data and says "Reconnecting".

Options go in the address:

| Option        | Meaning                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------- |
| `?refresh=30` | Seconds between reloads. From 15 to 3600, default 60.                                       |
| `?scale=1.5`  | Type size factor, from 0.75 to 3. It is remembered on that device, so later visits keep it. |

Combine them with `&`: `/kiosk/<id>?scale=1.5&refresh=120`.

### Keeping the screen on

The page asks the browser to keep the screen awake (the Screen Wake Lock API). That works only on **HTTPS**, and only in browsers that support it. If it is not available, a small note at the bottom right says why. Then turn off screen sleep in the device settings, or use a kiosk app that does it.

### An account for the display

The wall display uses a normal sign-in and can show everything that account can see. Create a separate account for it ([adding people](deployment.md#adding-people)) and add it to the household as a **device**, which can view the dashboard and its data but cannot edit lists or manage the household. Wall display mode hides list editing controls even when opened by an owner.

**Sessions expire.** A session lasts a fixed 14 days from sign-in, with no sliding renewal ([ADR 0010](../architecture/adr/0010-sessions-and-http-hardening.md)). When it ends, the next refresh gets a 401 and the display shows the sign-in page. Someone has to sign in again about every two weeks. There is deliberately no permanent token in the address, because a URL that signs in by itself would be a password that ends up in browser history and logs.

## Setting up a tablet

1. Create the display account and sign in once on the tablet. Let the browser remember nothing you do not want shared.
2. Open the wall display address and install the app or bookmark it.
3. Turn on a kiosk mode so a stray touch cannot leave the page:
   - **Chromium or Chrome on a PC or Raspberry Pi:** `chromium --kiosk --noerrdialogs --disable-infobars https://orbit.example.com/kiosk/<dashboard-id>`
   - **Android:** a kiosk-browser app such as Fully Kiosk Browser can pin the page, keep the screen on and restart it on a schedule. This is one option, not a recommendation. Check what any such app does with your data first.
   - **iPad:** Guided Access locks the device to one app.
4. Use the display's own power schedule to turn it off at night. The wall display does not know what time it is.

## Limits

- It reloads on a timer. There is no live push, so a change appears within the refresh interval.
- The Wake Lock hint cannot tell why a browser refused (for example battery saver). It reports "could not keep the screen awake".
