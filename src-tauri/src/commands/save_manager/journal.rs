use crate::commands::save_manager::error::SaveResult;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveOperation {
    pub id: String,
    pub schema_version: i64,
    pub operation_type: String,
    pub game_id: Option<String>,
    pub profile_id: Option<String>,
    pub state: String,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaveOperationLocation {
    pub operation_id: String,
    pub location_id: String,
    pub original_hash: Option<String>,
    pub staged_hash: Option<String>,
    pub final_hash: Option<String>,
    pub state: String,
    pub backup_path: Option<String>,
    pub staging_path: Option<String>,
}

pub struct JournalManager;

impl JournalManager {
    /// Creates a new operation record with state 'started' (Write-Ahead Invariant).
    pub fn create_operation(
        conn: &Connection,
        operation_type: &str,
        game_id: Option<&str>,
        profile_id: Option<&str>,
    ) -> SaveResult<String> {
        let op_id = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO save_operations (id, schema_version, operation_type, game_id, profile_id, state, started_at)
             VALUES (?1, 1, ?2, ?3, ?4, 'started', datetime('now'))",
            params![op_id, operation_type, game_id, profile_id],
        )?;
        Ok(op_id)
    }

    /// Registers a location participant in an operation.
    pub fn add_location(
        conn: &Connection,
        operation_id: &str,
        location_id: &str,
        original_hash: Option<&str>,
        backup_path: Option<&str>,
        staging_path: Option<&str>,
    ) -> SaveResult<()> {
        conn.execute(
            "INSERT INTO save_operation_locations (operation_id, location_id, original_hash, state, backup_path, staging_path)
             VALUES (?1, ?2, ?3, 'planned', ?4, ?5)",
            params![operation_id, location_id, original_hash, backup_path, staging_path],
        )?;
        Ok(())
    }

    /// Updates the overall state of an operation before the corresponding filesystem action.
    pub fn update_operation_state(
        conn: &Connection,
        operation_id: &str,
        new_state: &str,
    ) -> SaveResult<()> {
        let is_terminal = matches!(new_state, "completed" | "failed" | "rolled_back" | "recovered");
        if is_terminal {
            conn.execute(
                "UPDATE save_operations
                 SET state = ?1, completed_at = datetime('now')
                 WHERE id = ?2",
                params![new_state, operation_id],
            )?;
        } else {
            conn.execute(
                "UPDATE save_operations
                 SET state = ?1
                 WHERE id = ?2",
                params![new_state, operation_id],
            )?;
        }
        Ok(())
    }

    /// Records an error code and message on the operation.
    pub fn update_operation_error(
        conn: &Connection,
        operation_id: &str,
        error_code: &str,
        error_message: &str,
    ) -> SaveResult<()> {
        conn.execute(
            "UPDATE save_operations
             SET error_code = ?1, error_message = ?2
             WHERE id = ?3",
            params![error_code, error_message, operation_id],
        )?;
        Ok(())
    }

    /// Updates the state of a single location participant in an operation.
    pub fn update_location_state(
        conn: &Connection,
        operation_id: &str,
        location_id: &str,
        new_state: &str,
    ) -> SaveResult<()> {
        conn.execute(
            "UPDATE save_operation_locations
             SET state = ?1
             WHERE operation_id = ?2 AND location_id = ?3",
            params![new_state, operation_id, location_id],
        )?;
        Ok(())
    }

    /// Updates staged hash for a location.
    pub fn update_location_staged_hash(
        conn: &Connection,
        operation_id: &str,
        location_id: &str,
        staged_hash: &str,
    ) -> SaveResult<()> {
        conn.execute(
            "UPDATE save_operation_locations
             SET staged_hash = ?1
             WHERE operation_id = ?2 AND location_id = ?3",
            params![staged_hash, operation_id, location_id],
        )?;
        Ok(())
    }

    /// Updates final verified hash for a location.
    pub fn update_location_final_hash(
        conn: &Connection,
        operation_id: &str,
        location_id: &str,
        final_hash: &str,
    ) -> SaveResult<()> {
        conn.execute(
            "UPDATE save_operation_locations
             SET final_hash = ?1
             WHERE operation_id = ?2 AND location_id = ?3",
            params![final_hash, operation_id, location_id],
        )?;
        Ok(())
    }

    /// Fetches an operation by ID.
    #[allow(dead_code)]
    pub fn get_operation(
        conn: &Connection,
        operation_id: &str,
    ) -> SaveResult<Option<SaveOperation>> {
        let mut stmt = conn.prepare(
            "SELECT id, schema_version, operation_type, game_id, profile_id, state, started_at, completed_at, error_code, error_message
             FROM save_operations WHERE id = ?1",
        )?;
        let mut rows = stmt.query(params![operation_id])?;
        if let Some(row) = rows.next()? {
            Ok(Some(SaveOperation {
                id: row.get(0)?,
                schema_version: row.get(1)?,
                operation_type: row.get(2)?,
                game_id: row.get(3)?,
                profile_id: row.get(4)?,
                state: row.get(5)?,
                started_at: row.get(6)?,
                completed_at: row.get(7)?,
                error_code: row.get(8)?,
                error_message: row.get(9)?,
            }))
        } else {
            Ok(None)
        }
    }

    /// Fetches all locations registered for an operation.
    pub fn get_operation_locations(
        conn: &Connection,
        operation_id: &str,
    ) -> SaveResult<Vec<SaveOperationLocation>> {
        let mut stmt = conn.prepare(
            "SELECT operation_id, location_id, original_hash, staged_hash, final_hash, state, backup_path, staging_path
             FROM save_operation_locations WHERE operation_id = ?1",
        )?;
        let rows = stmt.query_map(params![operation_id], |row| {
            Ok(SaveOperationLocation {
                operation_id: row.get(0)?,
                location_id: row.get(1)?,
                original_hash: row.get(2)?,
                staged_hash: row.get(3)?,
                final_hash: row.get(4)?,
                state: row.get(5)?,
                backup_path: row.get(6)?,
                staging_path: row.get(7)?,
            })
        })?;

        let mut locs = Vec::new();
        for loc in rows {
            locs.push(loc?);
        }
        Ok(locs)
    }

    /// Queries all non-terminal operations for crash recovery at startup.
    /// Non-terminal states are anything NOT IN ('completed', 'rolled_back', 'recovered').
    pub fn get_non_terminal_operations(conn: &Connection) -> SaveResult<Vec<SaveOperation>> {
        let mut stmt = conn.prepare(
            "SELECT id, schema_version, operation_type, game_id, profile_id, state, started_at, completed_at, error_code, error_message
             FROM save_operations
             WHERE state NOT IN ('completed', 'rolled_back', 'recovered')
             ORDER BY started_at ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(SaveOperation {
                id: row.get(0)?,
                schema_version: row.get(1)?,
                operation_type: row.get(2)?,
                game_id: row.get(3)?,
                profile_id: row.get(4)?,
                state: row.get(5)?,
                started_at: row.get(6)?,
                completed_at: row.get(7)?,
                error_code: row.get(8)?,
                error_message: row.get(9)?,
            })
        })?;

        let mut ops = Vec::new();
        for op in rows {
            ops.push(op?);
        }
        Ok(ops)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE save_operations (
                id TEXT PRIMARY KEY,
                schema_version INTEGER NOT NULL DEFAULT 1,
                operation_type TEXT NOT NULL,
                game_id TEXT,
                profile_id TEXT,
                state TEXT NOT NULL,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                error_code TEXT,
                error_message TEXT
            )",
            [],
        )
        .unwrap();

        conn.execute(
            "CREATE TABLE save_operation_locations (
                operation_id TEXT NOT NULL,
                location_id TEXT NOT NULL,
                original_hash TEXT,
                staged_hash TEXT,
                final_hash TEXT,
                state TEXT NOT NULL,
                backup_path TEXT,
                staging_path TEXT,
                PRIMARY KEY (operation_id, location_id)
            )",
            [],
        )
        .unwrap();

        conn
    }

    #[test]
    fn test_journal_lifecycle() {
        let conn = setup_test_db();
        let op_id = JournalManager::create_operation(&conn, "prepare_launch", Some("g1"), Some("p1")).unwrap();

        let non_term = JournalManager::get_non_terminal_operations(&conn).unwrap();
        assert_eq!(non_term.len(), 1);
        assert_eq!(non_term[0].state, "started");

        JournalManager::update_operation_state(&conn, &op_id, "validated").unwrap();
        JournalManager::add_location(&conn, &op_id, "loc1", Some("hash1"), Some("b_path"), Some("s_path")).unwrap();

        let locs = JournalManager::get_operation_locations(&conn, &op_id).unwrap();
        assert_eq!(locs.len(), 1);
        assert_eq!(locs[0].location_id, "loc1");

        JournalManager::update_operation_state(&conn, &op_id, "completed").unwrap();
        let non_term_after = JournalManager::get_non_terminal_operations(&conn).unwrap();
        assert_eq!(non_term_after.len(), 0);
    }
}

