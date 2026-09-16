use chrono::{DateTime, Utc};
use std::sync::{Arc, Mutex};

/// IGDB's API sits behind Twitch's OAuth (client-credentials flow). The
/// resulting app access token is valid for weeks, so this cache avoids
/// requesting a fresh one on every single metadata fetch — managed as
/// Tauri state so it survives for the app's whole lifetime, not just
/// one command call.
#[derive(Clone, Default)]
pub struct IgdbTokenCache {
    inner: Arc<Mutex<Option<CachedToken>>>,
}

struct CachedToken {
    access_token: String,
    expires_at: DateTime<Utc>,
}

impl IgdbTokenCache {
    /// Returns a cached token if it still has more than 5 minutes of
    /// life left, otherwise `None` so the caller fetches a fresh one.
    pub fn get_valid(&self) -> Option<String> {
        let guard = self.inner.lock().expect("igdb token cache mutex poisoned");
        guard.as_ref().and_then(|cached| {
            let still_valid = cached.expires_at - Utc::now() > chrono::Duration::minutes(5);
            still_valid.then(|| cached.access_token.clone())
        })
    }

    pub fn store(&self, access_token: String, expires_in_seconds: u64) {
        let mut guard = self.inner.lock().expect("igdb token cache mutex poisoned");
        *guard = Some(CachedToken {
            access_token,
            expires_at: Utc::now() + chrono::Duration::seconds(expires_in_seconds as i64),
        });
    }
}
