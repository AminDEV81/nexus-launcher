pub use crate::commands::hub::{HubGame, HubGameDetails, HubVideo};
use crate::commands::metadata::steamgriddb::GridOption;
use serde::{Deserialize, Serialize};

fn deserialize_flexible_id<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    struct IdVisitor;

    impl<'de> serde::de::Visitor<'de> for IdVisitor {
        type Value = String;

        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("a string or integer id")
        }

        fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
        where
            E: serde::de::Error,
        {
            Ok(value.to_string())
        }

        fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
        where
            E: serde::de::Error,
        {
            Ok(value)
        }

        fn visit_i64<E>(self, value: i64) -> Result<Self::Value, E>
        where
            E: serde::de::Error,
        {
            Ok(value.to_string())
        }

        fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E>
        where
            E: serde::de::Error,
        {
            Ok(value.to_string())
        }
    }

    deserializer.deserialize_any(IdVisitor)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnifiedArtwork {
    #[serde(deserialize_with = "deserialize_flexible_id")]
    pub id: String,
    pub url: String,
    pub thumbnail_url: String,
    pub mime: String,
    pub is_animated: bool,
    #[serde(default)]
    pub width: i64,
    #[serde(default)]
    pub height: i64,
    #[serde(default)]
    pub provider: String, // "steam", "steamgrid", "local"
    #[serde(alias = "type")]
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
