ALTER TABLE save_operation_locations RENAME TO save_operation_locations_old;

CREATE TABLE save_operation_locations (
    operation_id    TEXT NOT NULL REFERENCES save_operations(id) ON DELETE CASCADE,
    location_id     TEXT NOT NULL REFERENCES game_save_locations(id) ON DELETE CASCADE,
    original_hash   TEXT,
    staged_hash     TEXT,
    final_hash      TEXT,
    state           TEXT NOT NULL,
    backup_path     TEXT,
    staging_path    TEXT,
    PRIMARY KEY (operation_id, location_id)
);

INSERT INTO save_operation_locations (operation_id, location_id, original_hash, staged_hash, final_hash, state, backup_path, staging_path)
SELECT operation_id, location_id, original_hash, staged_hash, final_hash, state, backup_path, staging_path
FROM save_operation_locations_old;

DROP TABLE save_operation_locations_old;

CREATE INDEX IF NOT EXISTS idx_save_operation_locations_operation_id ON save_operation_locations(operation_id);
CREATE INDEX IF NOT EXISTS idx_save_operation_locations_location_id ON save_operation_locations(location_id);
