-- Railway MySQL: users + saved_networks (ETS node structure)

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  name VARCHAR(255) NULL,
  provider VARCHAR(64) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS saved_networks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  name VARCHAR(191) NOT NULL,
  node_count INT NOT NULL,
  prec_nodes_json JSON NOT NULL COMMENT '長度 N：Prec_Node(i) 前置節點 ID 列表',
  node_times_json JSON NOT NULL COMMENT '長度 N：Node_Time(i) 靜態均值（規劃輸入）',
  finish_flags_json JSON NOT NULL COMMENT '長度 N：finish_flag_i',
  outputs_json JSON NOT NULL COMMENT '長度 N：Output_i 精簡型態 {mean, variance}',
  lcta_result_json JSON NULL COMMENT 'LCTA 完成時間 PDF 分佈（與資料表連結）',
  pass_review TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=已通過 Review，才可 Graph Network',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_saved_networks_user_name (user_id, name),
  CONSTRAINT fk_saved_networks_user
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
