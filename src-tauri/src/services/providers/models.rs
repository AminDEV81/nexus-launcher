pub use crate::commands::hub::{HubGame, HubGameDetails, HubVideo};
use crate::commands::metadata::steamgriddb::GridOption;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnifiedArtwork {
    pub id: String,
    pub url: String,
    pub thumbnail_url: String,
    pub mime: String,
    pub is_animated: bool,
    pub width: i64,
    pub height: i64,
    pub provider: String, // "steam", "steamgrid", "local"
    pub artwork_type: String, // "cover", "hero", "logo", "screenshot"
}

impl UnifiedArtwork {
    pub fn to_grid_option(&self) -> GridOption {
        let numeric_id = self
            .id
            .parse::<i64>()
            .unwrap_or_else(|_| {
                let mut hasher = std::collections::hash_map::DefaultHasher::new();
                std::hash::Hash::hash(&self.id, &mut hasher);
                std::hash::Hasher::finish(&hasher) as i64
            });

        GridOption {
            id: numeric_id,
            url: self.url.clone(),
            thumbnail_url: self.thumbnail_url.clone(),
            mime: self.mime.clone(),
            is_animated: self.is_animated,
            width: self.width,
            height: self.height,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NameIdItem {
    pub id: i64,
    pub name: String,
}
