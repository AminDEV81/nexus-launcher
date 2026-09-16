use std::collections::HashMap;
use std::sync::{Arc, Mutex as StdMutex};
use tokio::sync::{Mutex as AsyncMutex, MutexGuard as AsyncMutexGuard};

/// Strict Lock Hierarchy (Section 2 & 15):
/// 1. Global Save Manager Lock (`global`) - process-wide.
/// 2. Per-Game Lock (`game_locks`) - keyed by game_id.
///
/// Any code path MUST acquire Global before Game, and release Game before Global.
pub struct SaveManagerLocks {
    pub global: AsyncMutex<()>,
    game_locks: StdMutex<HashMap<String, Arc<AsyncMutex<()>>>>,
}

impl Default for SaveManagerLocks {
    fn default() -> Self {
        Self::new()
    }
}

impl SaveManagerLocks {
    pub fn new() -> Self {
        Self {
            global: AsyncMutex::new(()),
            game_locks: StdMutex::new(HashMap::new()),
        }
    }

    /// Retrieves or initializes the Arc<AsyncMutex<()>> for a given game.
    pub fn get_game_lock(&self, game_id: &str) -> Arc<AsyncMutex<()>> {
        let mut map = self.game_locks.lock().expect("game_locks mutex poisoned");
        map.entry(game_id.to_string())
            .or_insert_with(|| Arc::new(AsyncMutex::new(())))
            .clone()
    }

    /// Acquires the Global lock and then the Per-Game lock in strict order.
    /// Returns both guards.
    pub async fn acquire_game_transaction_locks(
        &self,
        game_id: &str,
    ) -> (AsyncMutexGuard<'_, ()>, tokio::sync::OwnedMutexGuard<()>) {
        let global_guard = self.global.lock().await;
        let game_lock = self.get_game_lock(game_id);
        let game_guard = game_lock.lock_owned().await;
        (global_guard, game_guard)
    }
}
