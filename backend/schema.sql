-- schema.sql
CREATE DATABASE IF NOT EXISTS enghub CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE enghub;

-- Users
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(190) NOT NULL UNIQUE,
  password VARCHAR(190) NOT NULL,
  name VARCHAR(190) NOT NULL,
  avatar VARCHAR(300) DEFAULT '/images/avatar1.png',
  bio TEXT,
  skills JSON NULL,
  links JSON NULL,              -- NEW: social/contact links
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  owner_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  long_description TEXT NULL,
  category JSON NULL,
  image VARCHAR(300) DEFAULT '/images/placeholder.png',
  downloads INT NOT NULL DEFAULT 0,
  public_id CHAR(12) UNIQUE,              -- <— add this
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- Attachments (uploaded files linked to a project)
CREATE TABLE IF NOT EXISTS attachments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  filename VARCHAR(255) NOT NULL,
  url VARCHAR(400) NOT NULL,
  size BIGINT NOT NULL DEFAULT 0,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Comments
CREATE TABLE IF NOT EXISTS comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  user_id INT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Likes (value = 1 for like, -1 for dislike); one row per user+project
CREATE TABLE IF NOT EXISTS likes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  user_id INT NOT NULL,
  value TINYINT NOT NULL,  -- 1 or -1
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_like (project_id, user_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
-- References (unified: internal & external)
CREATE TABLE IF NOT EXISTS project_references (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  ref_target CHAR(12) NOT NULL,   -- 'external' or 12-digit public_id
  ref_url    VARCHAR(500) NULL,   -- NULL for internal, URL for external
  ref_desc   VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ref_src FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  INDEX idx_project_references_target (ref_target),
  UNIQUE KEY uniq_project_ref (project_id, ref_target, ref_url)   -- <-- add this
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


ALTER TABLE users ADD COLUMN email VARCHAR(190) UNIQUE;


CREATE TABLE IF NOT EXISTS password_resets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_password_resets_user (user_id),
  INDEX idx_password_resets_expires (expires_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
