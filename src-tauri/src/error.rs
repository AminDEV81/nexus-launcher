use serde::Serialize;

/// Central error type for the whole backend.
///
/// Every Tauri command returns `Result<T, AppError>`. Because Tauri needs
/// command errors to be serializable to send them back to the frontend,
/// we implement `Serialize` manually below (as a plain string message)
/// instead of deriving it, so we don't leak internal error representations
/// to the UI while still keeping rich variants for logging on the Rust side.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("could not resolve application data directory")]
    AppDataDirUnavailable,

    #[error("{0}")]
    NotFound(String),

    #[error("{0}")]
    Invalid(String),

    #[error("{0}")]
    Other(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
