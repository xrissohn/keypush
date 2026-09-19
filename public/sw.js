/* KeyP notification foundation.
 * Remote background push remains disabled until a VAPID-backed push provider is configured.
 */
self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(self.registration.showNotification(data.title || "KeyP가 새 정보를 찾았어요", {
    body: data.body || "새로 확인된 정보를 확인해보세요.",
    icon: "/favicon.png",
    badge: "/favicon.png",
    tag: data.notificationId,
    data: { url: data.url || "/" },
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.url || "/"));
});
