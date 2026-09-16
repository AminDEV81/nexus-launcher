use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveManagerErrorPayload {
    pub code: String,
    pub message: String,
    pub operation_id: Option<String>,
    pub recoverable: bool,
    pub path: Option<String>,
}

#[derive(Debug, Error)]
#[allow(dead_code)]
pub enum SaveManagerError {
    #[error("GAME_RUNNING: {0}")]
    GameRunning(String),

    #[error("GAME_SESSION_ACTIVE: {0}")]
    GameSessionActive(String),

    #[error("SAVE_PATH_NOT_FOUND: {0}")]
    SavePathNotFound(String),

    #[error("SAVE_PATH_ACCESS_DENIED: {0}")]
    SavePathAccessDenied(String),

    #[error("SAVE_PATH_INVALID: {0}")]
    SavePathInvalid(String),

    #[error("SAVE_PATH_READ_ONLY: {0}")]
    SavePathReadOnly(String),

    #[error("SAVE_PATH_LOCKED: {0}")]
    SavePathLocked(String),

    #[error("DISK_SPACE_INSUFFICIENT: {0}")]
    DiskSpaceInsufficient(String),

    #[error("SNAPSHOT_FAILED: {0}")]
    SnapshotFailed(String),

    #[error("SNAPSHOT_VERIFICATION_FAILED: {0}")]
    SnapshotVerificationFailed(String),

    #[error("STAGING_FAILED: {0}")]
    StagingFailed(String),

    #[error("STAGING_VERIFICATION_FAILED: {0}")]
    StagingVerificationFailed(String),

    #[error("COMMIT_FAILED: {0}")]
    CommitFailed(String),

    #[error("FINAL_VERIFICATION_FAILED: {0}")]
    FinalVerificationFailed(String),

    #[error("ROLLBACK_FAILED: {0}")]
    RollbackFailed(String),

    #[error("OPERATION_IN_PROGRESS: {0}")]
    OperationInProgress(String),

    #[error("PROFILE_NOT_FOUND: {0}")]
    ProfileNotFound(String),

    #[error("PROFILE_IS_ACTIVE: {0}")]
    ProfileIsActive(String),

    #[error("INVALID_PROFILE: {0}")]
    InvalidProfile(String),

    #[error("RECOVERY_REQUIRED: {0}")]
    RecoveryRequired(String),

    #[error("SAVE_CORRUPT: {0}")]
    SaveCorrupt(String),

    #[error("SAVE_EMPTY: {0}")]
    SaveEmpty(String),

    #[error("MULTIPLE_SAVE_LOCATIONS_FAILED: {0}")]
    MultipleSaveLocationsFailed(String),

    #[error("PROCESS_TRACKING_FAILED: {0}")]
    ProcessTrackingFailed(String),

    #[error("SESSION_NOT_FOUND: {0}")]
    SessionNotFound(String),

    #[error("DATABASE_ERROR: {0}")]
    DatabaseError(String),

    #[error("IO_ERROR: {0}")]
    IoError(String),
}

impl SaveManagerError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::GameRunning(_) => "GAME_RUNNING",
            Self::GameSessionActive(_) => "GAME_SESSION_ACTIVE",
            Self::SavePathNotFound(_) => "SAVE_PATH_NOT_FOUND",
            Self::SavePathAccessDenied(_) => "SAVE_PATH_ACCESS_DENIED",
            Self::SavePathInvalid(_) => "SAVE_PATH_INVALID",
            Self::SavePathReadOnly(_) => "SAVE_PATH_READ_ONLY",
            Self::SavePathLocked(_) => "SAVE_PATH_LOCKED",
            Self::DiskSpaceInsufficient(_) => "DISK_SPACE_INSUFFICIENT",
            Self::SnapshotFailed(_) => "SNAPSHOT_FAILED",
            Self::SnapshotVerificationFailed(_) => "SNAPSHOT_VERIFICATION_FAILED",
            Self::StagingFailed(_) => "STAGING_FAILED",
            Self::StagingVerificationFailed(_) => "STAGING_VERIFICATION_FAILED",
            Self::CommitFailed(_) => "COMMIT_FAILED",
            Self::FinalVerificationFailed(_) => "FINAL_VERIFICATION_FAILED",
            Self::RollbackFailed(_) => "ROLLBACK_FAILED",
            Self::OperationInProgress(_) => "OPERATION_IN_PROGRESS",
            Self::ProfileNotFound(_) => "PROFILE_NOT_FOUND",
            Self::ProfileIsActive(_) => "PROFILE_IS_ACTIVE",
            Self::InvalidProfile(_) => "INVALID_PROFILE",
            Self::RecoveryRequired(_) => "RECOVERY_REQUIRED",
            Self::SaveCorrupt(_) => "SAVE_CORRUPT",
            Self::SaveEmpty(_) => "SAVE_EMPTY",
            Self::MultipleSaveLocationsFailed(_) => "MULTIPLE_SAVE_LOCATIONS_FAILED",
            Self::ProcessTrackingFailed(_) => "PROCESS_TRACKING_FAILED",
            Self::SessionNotFound(_) => "SESSION_NOT_FOUND",
            Self::DatabaseError(_) => "DATABASE_ERROR",
            Self::IoError(_) => "IO_ERROR",
        }
    }

    pub fn to_payload(&self, operation_id: Option<String>, path: Option<String>) -> SaveManagerErrorPayload {
        let recoverable = !matches!(self, Self::RollbackFailed(_) | Self::RecoveryRequired(_));

        SaveManagerErrorPayload {
            code: self.code().to_string(),
            message: self.to_string(),
            operation_id,
            recoverable,
            path,
        }
    }
}

impl Serialize for SaveManagerError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        self.to_payload(None, None).serialize(serializer)
    }
}

impl From<rusqlite::Error> for SaveManagerError {
    fn from(err: rusqlite::Error) -> Self {
        Self::DatabaseError(err.to_string())
    }
}

impl From<std::io::Error> for SaveManagerError {
    fn from(err: std::io::Error) -> Self {
        Self::IoError(err.to_string())
    }
}

pub type SaveResult<T> = Result<T, SaveManagerError>;
