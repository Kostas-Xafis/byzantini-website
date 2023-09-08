CREATE TABLE email_subscriptions (
    `email` varchar(80) NOT NULL,
    `unsubscribe_token` varchar(16) NOT NULL,
    PRIMARY KEY (`email`)
)DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE query_logs (
    `id` int NOT NULL AUTO_INCREMENT,
    `query` varchar(400) NOT NULL,
    `args` varchar(400) NOT NULL,
    `date` bigint NOT NULL,
    PRIMARY KEY (`id`)
)DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
