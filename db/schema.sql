-- =============================================================================
-- PNA / Network — MySQL schema (InnoDB, utf8mb4)
-- =============================================================================
-- 與 api/index.py 內 init_schema() / migrate_schema() 對齊。
-- 若資料庫已由 FastAPI 啟動時自動建立，可不必手動執行本檔。
--
-- 節點語意：
--   previous_nodes : JSON 陣列，代表「指向本節點」的前置節點 ID（有向邊 來源 → 本節點）。
--   pre_path       : JSON 陣列，保留給最短路徑／資源分配等演算法的「路徑順序」擴充。
-- =============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- -----------------------------------------------------------------------------
-- users：登入使用者（Email／Google OAuth／密碼雜湊）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NULL COMMENT 'Credentials 登入 bcrypt 雜湊；OAuth 可為 NULL',
    name VARCHAR(255) NULL,
    provider VARCHAR(64) NULL COMMENT 'credentials / google 等',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- node_tables：使用者設計的一張「節點參數表」（設計稿／待審查）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS node_tables (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    owner_user_id VARCHAR(64) NOT NULL COMMENT '對應 NextAuth session user.id（字串）',
    name VARCHAR(191) NOT NULL COMMENT '資料表顯示名稱',
    pass_flag BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否已通過後端審查規則',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_node_tables_owner_name (owner_user_id, name),
    KEY idx_node_tables_owner (owner_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- node_table_nodes：單張 node_tables 內的每一列節點
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS node_table_nodes (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    node_table_id BIGINT NOT NULL,
    node_id INT NOT NULL COMMENT '節點編號，設計上為 0..N-1 連續',
    previous_nodes JSON NOT NULL COMMENT '前置節點 ID 列表（DAG 邊：來源 -> 本節點）',
    pre_path JSON NOT NULL COMMENT '演算法用的路徑／順序資訊（JSON 陣列）',
    mean_time DOUBLE NOT NULL DEFAULT 0 COMMENT '平均時間／均值（Mean Time）',
    flag BOOLEAN NOT NULL DEFAULT FALSE,
    output DOUBLE NOT NULL DEFAULT 0,
    UNIQUE KEY uq_node_table_nodes_table_node (node_table_id, node_id),
    KEY idx_node_table_nodes_table_id (node_table_id),
    CONSTRAINT fk_node_table_nodes_table
        FOREIGN KEY (node_table_id)
        REFERENCES node_tables(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- networks：通過審查後產生的「網路」快照（節點 JSON + 圖檔）
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS networks (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    owner_user_id VARCHAR(64) NOT NULL,
    node_table_id BIGINT NOT NULL COMMENT '來源 node_tables.id',
    name VARCHAR(191) NOT NULL COMMENT '網路顯示名稱（同一 owner 下唯一）',
    nodes_json JSON NOT NULL COMMENT '完整 NodeInput 列表快照（含 previousNodes、prePath 等）',
    graph LONGTEXT NOT NULL COMMENT '網路結構圖，通常為 data:image/png;base64,...',
    graph_format VARCHAR(64) NOT NULL DEFAULT 'image/png;base64-data-url'
        COMMENT '圖檔編碼說明',
    notes TEXT NULL COMMENT '備註或日後分析結果摘要',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_networks_owner_name (owner_user_id, name),
    KEY idx_networks_owner (owner_user_id),
    KEY idx_networks_node_table (node_table_id),
    CONSTRAINT fk_networks_node_table
        FOREIGN KEY (node_table_id)
        REFERENCES node_tables(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- （選用）未來擴充：演算法結果與資源配置
-- 以下為建議 DDL，應用程式尚未寫入這些表時可先保留為註解或另行 migration。
-- =============================================================================
--
-- CREATE TABLE IF NOT EXISTS network_analysis_runs (
--     id BIGINT AUTO_INCREMENT PRIMARY KEY,
--     network_id BIGINT NOT NULL,
--     owner_user_id VARCHAR(64) NOT NULL,
--     algorithm VARCHAR(64) NOT NULL COMMENT 'shortest_path | longest_path | resource_allocation | ...',
--     params_json JSON NULL COMMENT '演算法參數',
--     result_json JSON NOT NULL COMMENT '結果（路徑列表、時間總和、分配向量等）',
--     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     KEY idx_analysis_network (network_id),
--     CONSTRAINT fk_analysis_network FOREIGN KEY (network_id)
--         REFERENCES networks(id) ON DELETE CASCADE
-- ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
--
