-- DROP TABLES;

DROP TABLE IF EXISTS `total_registrations`;
DROP TABLE IF EXISTS `registrations`;
DROP TABLE IF EXISTS `books`;
DROP TABLE IF EXISTS `wholesalers`;
DROP TABLE IF EXISTS `payments`;
DROP TABLE IF EXISTS `total_payments`;
DROP TABLE IF EXISTS `school_payoffs`;
DROP TABLE IF EXISTS `total_school_payoffs`;
DROP TABLE IF EXISTS `locations`;
DROP TABLE IF EXISTS `teachers`;
DROP TABLE IF EXISTS `instruments`;
DROP TABLE IF EXISTS `class_type`;
DROP TABLE IF EXISTS `teacher_classes`;
DROP TABLE IF EXISTS `teacher_locations`;
DROP TABLE IF EXISTS `teacher_instruments`;
DROP TABLE IF EXISTS `files`;
DROP TABLE IF EXISTS `sys_users`;
DROP TABLE IF EXISTS `sys_user_register_links`;

-- DB SCHEMA;
CREATE TABLE `wholesalers` (
    `id` int NOT NULL AUTO_INCREMENT,
    `name` varchar(80) NOT NULL,
    PRIMARY KEY (`id`)
)CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO wholesalers (name) VALUES ('George Orwell');
INSERT INTO wholesalers (name) VALUES ('F. Scott Fitzgerald');
INSERT INTO wholesalers (name) VALUES ('Frances Hodgson Burnett');
INSERT INTO wholesalers (name) VALUES ('Harper Lee');
INSERT INTO wholesalers (name) VALUES ('J.K. Rowling');
INSERT INTO wholesalers (name) VALUES ('Jane Austen');
INSERT INTO wholesalers (name) VALUES ('J.R.R. Tolkien');
INSERT INTO wholesalers (name) VALUES ('J.D. Salinger');
INSERT INTO wholesalers (name) VALUES ('Paulo Coelho');


CREATE TABLE `books`(
    `id` int NOT NULL AUTO_INCREMENT,
    `title` varchar(80) NOT NULL,
    `wholesaler_id` int NOT NULL,
    `wholesale_price` int NOT NULL,
    `price` int NOT NULL,
    `quantity` int NOT NULL,
    `sold` int NOT NULL,
PRIMARY KEY (`id`))
AUTO_INCREMENT=0 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO books (title, wholesaler_id, wholesale_price, price, quantity, sold) VALUES ("1984", 1, 13, 15, 30, 10);
INSERT INTO books (title, wholesaler_id, wholesale_price, price, quantity, sold) VALUES ("The Great Gatsby", 2, 9, 12, 40, 15);
INSERT INTO books (title, wholesaler_id, wholesale_price, price, quantity, sold) VALUES ("The Lord of the Rings", 7, 20, 25, 45, 24);
INSERT INTO books (title, wholesaler_id, wholesale_price, price, quantity, sold) VALUES ("The Secret Garden", 3, 16, 20, 50, 20);
INSERT INTO books (title, wholesaler_id, wholesale_price, price, quantity, sold) VALUES ("1986", 1, 13, 15, 30, 25);
INSERT INTO books (title, wholesaler_id, wholesale_price, price, quantity, sold) VALUES ("To Kill a Mockingbird", 4, 10, 13, 20, 11);
INSERT INTO books (title, wholesaler_id, wholesale_price, price, quantity, sold) VALUES ("The Sad Gatsby", 2, 9, 12, 40, 27);
INSERT INTO books (title, wholesaler_id, wholesale_price, price, quantity, sold) VALUES ("Harry Potter and the Sorcerer's Stone", 5, 15, 17, 60, 47);
INSERT INTO books (title, wholesaler_id, wholesale_price, price, quantity, sold) VALUES ("Pride and Prejudice", 6, 8, 10, 25, 16);
INSERT INTO books (title, wholesaler_id, wholesale_price, price, quantity, sold) VALUES ("The Hobbit", 7, 12, 15, 35, 12);
INSERT INTO books (title, wholesaler_id, wholesale_price, price, quantity, sold) VALUES ("The Catcher in the Rye", 8, 11, 14, 15, 12);
INSERT INTO books (title, wholesaler_id, wholesale_price, price, quantity, sold) VALUES ("The Alchemist", 9,  10, 12, 30, 18);
INSERT INTO books (title, wholesaler_id, wholesale_price, price, quantity, sold) VALUES ("The Rock of the Rings", 7, 20, 25, 45, 23);

CREATE TABLE `payments`(
    `id` int AUTO_INCREMENT,
    `student_name` varchar(80) NOT NULL,
    `book_id` int NOT NULL,
    `amount` int NOT NULL,
    `date` bigint NOT NULL,
    `payment_date` bigint,
    PRIMARY KEY (`id`)
) CHARSET=utf8mb4 AUTO_INCREMENT=0 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE `total_payments` (
    `amount` int DEFAULT 0
)CHARSET=utf8mb4;

INSERT INTO payments (student_name, book_id, amount, date) VALUES ("Jane Smith", 1, 15, 1686580302600);
INSERT INTO payments (student_name, book_id, amount, date) VALUES ("John Doe", 2, 12, 1686580312655);
INSERT INTO payments (student_name, book_id, amount, date) VALUES ("Michael Johnson", 3, 25, 1686580312657);
INSERT INTO payments (student_name, book_id, amount, date) VALUES ("Emily Davis", 4, 20, 1686580312658);
INSERT INTO payments (student_name, book_id, amount, date) VALUES ("Daniel Wilson", 6, 13, 1686580312659);
INSERT INTO payments (student_name, book_id, amount, date) VALUES ("Olivia Thompson", 6, 13, 1686580312660);
INSERT INTO payments (student_name, book_id, amount, date) VALUES ("William Martinez", 8, 17, 1686580312661);
INSERT INTO payments (student_name, book_id, amount, date) VALUES ("Sophia Anderson", 8, 17, 1686580312662);
INSERT INTO payments (student_name, book_id, amount, date) VALUES ("James Taylor", 10, 15, 1686580312663);
INSERT INTO payments (student_name, book_id, amount, date) VALUES ("Emma Hernandez", 10, 15, 1686580312664);

INSERT INTO total_payments (amount) SELECT SUM(amount) FROM payments;

CREATE TABLE `school_payoffs` (
    `id` int NOT NULL AUTO_INCREMENT,
    `wholesaler_id` int NOT NULL,
    `amount` int NOT NULL,
    PRIMARY KEY (`id`))
AUTO_INCREMENT=0 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `total_school_payoffs` (
    `amount` int DEFAULT 0
)CHARSET=utf8mb4;

INSERT INTO school_payoffs (wholesaler_id, amount) SELECT wholesaler_id, SUM((quantity-sold)*wholesale_price) FROM books GROUP BY wholesaler_id;

INSERT INTO total_school_payoffs (amount) SELECT SUM(amount) FROM school_payoffs;

CREATE TABLE `locations` (
    `id` int NOT NULL AUTO_INCREMENT,
    `name` varchar(80) NOT NULL,
    `address` varchar(80) NOT NULL,
    `areacode` int NOT NULL,
    `municipality` varchar(80) NOT NULL,
    `manager` varchar(80),
    `email` varchar(80) NOT NULL,
    `telephones` varchar(80) NOT NULL,
    `priority` int NOT NULL DEFAULT 0,
    `image` varchar(80),
    `map` varchar(400) NOT NULL,
    `link` varchar(200),
    PRIMARY KEY (`id`)
)AUTO_INCREMENT=0 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO locations (name, address, areacode, municipality, email, telephones, map, link) VALUES ("Έδρα Μεταμόρφωσης", "Χλόης 1", 1234, "Δήμου Μεταμορφώσεως", "mail@mail.com", "2108765431", 'pb=!1m14!1m8!1m3!1d1570.624418393948!2d23.76043140013884!3d38.06458564642159!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x14a1a2005430a9cd%3A0xb0ae73d2ed83fee2!2zzpnOtc-Bz4zPgiDOnc6xz4zPgiDOnM61z4TOsc68zr_Pgc-Gz47Pg863z4Igz4TOv8-FIM6jz4nPhM6uz4HOv8-C!5e0!3m2!1sel!2sgr!4v1692552004173!5m2!1sel!2sgr', "https://inmm.gr/");
INSERT INTO locations (name, address, areacode, municipality, email, telephones, map) VALUES ("Παράρτημα Πεύκης", "Παπανδρέου 28", 1234, "Πεύκης", "mail@mail.com", "2108765432", "Athens,Greece");
INSERT INTO locations (name, address, areacode, municipality, email, telephones, map) VALUES ("Παράρτημα Εκάλης", "Αγίου Ιωάννου 17", 1234, "Εκάλης", "mail@mail.com", "2108765433", "Athens,Greece");
INSERT INTO locations (name, address, areacode, municipality, email, telephones, map) VALUES ("Παράρτημα Κηφισιάς", "Λεωφόρος Κηφισίας 12", 1234, "Κηφισιάς", "mail@mail.com", "2108765434", "Athens,Greece");

CREATE TABLE `teachers` (
    `id` int NOT NULL AUTO_INCREMENT,
    `fullname` varchar(80) NOT NULL,
    `picture` varchar(20),
    `cv` varchar(20),
    `priority` int NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`)
)AUTO_INCREMENT=0 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `class_type` (
    `id` int NOT NULL AUTO_INCREMENT,
    `name` varchar(80) NOT NULL,
    PRIMARY KEY (`id`)
)AUTO_INCREMENT=0 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `instruments` (
    `id` int NOT NULL AUTO_INCREMENT,
    `name` varchar(80) NOT NULL,
    `type` varchar(4) NOT NULL, 
    PRIMARY KEY (`id`)
)AUTO_INCREMENT=0;

CREATE TABLE `teacher_instruments`(
    `teacher_id` int NOT NULL,
    `instrument_id` int NOT NULL,
    PRIMARY KEY (`teacher_id`, `instrument_id`)
);

CREATE TABLE `teacher_locations` (
    `teacher_id` int NOT NULL,
    `location_id` int NOT NULL,
    PRIMARY KEY (`teacher_id`, `location_id`)
);

CREATE TABLE `teacher_classes` (
    `teacher_id` int NOT NULL,
    `class_id` int NOT NULL,
    PRIMARY KEY (`teacher_id`, `class_id`)
);

INSERT INTO class_type (name) VALUES ('Βυζαντινή Μουσική');
INSERT INTO class_type (name) VALUES ('Παραδοσιακή Μουσική');
INSERT INTO class_type (name) VALUES ('Ευρωπαϊκή Μουσική');

INSERT INTO teachers (fullname) VALUES ('John Doe');
INSERT INTO teachers (fullname) VALUES ('Jane Doe');
INSERT INTO teachers (fullname) VALUES ('Michael Johnson');
INSERT INTO teachers (fullname) VALUES ('Emily Davis');
INSERT INTO teachers (fullname) VALUES ('Patrick Miller');

INSERT INTO teacher_classes (teacher_id, class_id) VALUES (1, 1);
INSERT INTO teacher_classes (teacher_id, class_id) VALUES (1, 2);
INSERT INTO teacher_classes (teacher_id, class_id) VALUES (2, 2);
INSERT INTO teacher_classes (teacher_id, class_id) VALUES (3, 1);
INSERT INTO teacher_classes (teacher_id, class_id) VALUES (4, 1);
INSERT INTO teacher_classes (teacher_id, class_id) VALUES (4, 2);
INSERT INTO teacher_classes (teacher_id, class_id) VALUES (5, 1);
INSERT INTO teacher_classes (teacher_id, class_id) VALUES (5, 3);

INSERT INTO teacher_locations (teacher_id, location_id) VALUES (1, 1);
INSERT INTO teacher_locations (teacher_id, location_id) VALUES (1, 2);
INSERT INTO teacher_locations (teacher_id, location_id) VALUES (2, 3);
INSERT INTO teacher_locations (teacher_id, location_id) VALUES (2, 4);
INSERT INTO teacher_locations (teacher_id, location_id) VALUES (3, 1);
INSERT INTO teacher_locations (teacher_id, location_id) VALUES (3, 3);
INSERT INTO teacher_locations (teacher_id, location_id) VALUES (4, 2);
INSERT INTO teacher_locations (teacher_id, location_id) VALUES (4, 4);
INSERT INTO teacher_locations (teacher_id, location_id) VALUES (5, 4);
INSERT INTO teacher_locations (teacher_id, location_id) VALUES (5, 2);

CREATE TABLE `total_registrations` (
    `amount` int DEFAULT 0,
    `year` int NOT NULL
);

INSERT INTO total_registrations (amount, year) VALUES (0, 2023);

CREATE TABLE `registrations`(
    `id` int DEFAULT 0,
    `am` varchar(4) NOT NULL,
    `last_name` varchar(80) NOT NULL,
    `first_name` varchar(80) NOT NULL,
    `fathers_name` varchar(80) NOT NULL,
    `birth_year` int NOT NULL,
    `road` varchar(80) NOT NULL,
    `number` int NOT NULL,
    `tk` int NOT NULL,
    `region` varchar(80) NOT NULL,
    `telephone` varchar(20) DEFAULT "-",
    `cellphone` varchar(20) NOT NULL,
    `email` varchar(80) NOT NULL,
    `registration_year` varchar(12) NOT NULL,
    `class_year` varchar(40) NOT NULL,
    `class_id` int NOT NULL,
    `teacher_id` int NOT NULL,
    `instrument_id` int DEFAULT 0,
    `date` bigint NOT NULL,
    `payment_amount` int DEFAULT 0,
    `payment_date` bigint DEFAULT 0,
    PRIMARY KEY (`am`, `instrument_id`, `first_name`, `cellphone`)
)AUTO_INCREMENT=0 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 0 - simple admin - 1 - super admin - 2 - root admin;
CREATE TABLE `sys_users` (
    `id` int NOT NULL AUTO_INCREMENT,
    `email` varchar(80) NOT NULL,
    `password` varchar(80) NOT NULL,
    `session_id` varchar(40),
    `session_exp_date` bigint,
    `privilege` int NOT NULL DEFAULT 0,
    `last_reg_check_id` int NOT NULL DEFAULT 0,
    PRIMARY KEY (`id`, `email`)
)AUTO_INCREMENT=0 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO sys_users (email, password, privilege) VALUES ('koxafis@gmail.com', 'Whereiswaldo!09', 2);
INSERT INTO sys_users (email, password, privilege) VALUES ('sotiris_ale@hotmail.com', '1234', 1);

CREATE TABLE `sys_user_register_links` (
    `link` varchar(80) NOT NULL,
    `exp_date` bigint NOT NULL,
    `privilege` int NOT NULL,
    PRIMARY KEY (`link`)
)DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO instruments (name, type) VALUES ('Ούτι', "par");
INSERT INTO instruments (name, type) VALUES ('Λαούτο', "par");
INSERT INTO instruments (name, type) VALUES ('Πολίτικο Λαούτο', "par");
INSERT INTO instruments (name, type) VALUES ('Πανδουρίδα - Ταμπούρ', "par");
INSERT INTO instruments (name, type) VALUES ('Πανδουρίδα - Ταμπουράς', "par");
INSERT INTO instruments (name, type) VALUES ('Μαντολίνο', "par");
INSERT INTO instruments (name, type) VALUES ('Σαντούρι', "par");
INSERT INTO instruments (name, type) VALUES ('Τσίμπαλο', "par");
INSERT INTO instruments (name, type) VALUES ('Κανονάκι', "par");
INSERT INTO instruments (name, type) VALUES ('Πολίτικη Λύρα', "par");
INSERT INTO instruments (name, type) VALUES ('Βιολοντσέλο', "par");
INSERT INTO instruments (name, type) VALUES ('Βιολί', "par");
INSERT INTO instruments (name, type) VALUES ('Νέι', "par");
INSERT INTO instruments (name, type) VALUES ('Κλαρίνο', "par");
INSERT INTO instruments (name, type) VALUES ('Φλογέρα - Σουραύλι', "par");
INSERT INTO instruments (name, type) VALUES ('Σύριγγα Πανός (μουσκάλι)', "par");
INSERT INTO instruments (name, type) VALUES ('Τρομπέτα', "par");
INSERT INTO instruments (name, type) VALUES ('Σαξόφωνο', "par");
INSERT INTO instruments (name, type) VALUES ('Τρομπόνι', "par");
INSERT INTO instruments (name, type) VALUES ('Παραδοσιακά μεμβρανόφωνα κρουστά', "par");
INSERT INTO instruments (name, type) VALUES ('Κρητική λύρα', "par");
INSERT INTO instruments (name, type) VALUES ('Ποντιακή λύρα', "par");
INSERT INTO instruments (name, type) VALUES ('Λύρα Ανατολικού Αιγαίου', "par");
INSERT INTO instruments (name, type) VALUES ('Λύρα Θράκης και Μακεδονίας', "par");
INSERT INTO instruments (name, type) VALUES ('Άσκαυλος', "par");
INSERT INTO instruments (name, type) VALUES ('Ζουρνάς', "par");
INSERT INTO instruments (name, type) VALUES ('Μπουζούκι', "par");
INSERT INTO instruments (name, type) VALUES ('Λαϊκή κιθάρα', "par");
INSERT INTO instruments (name, type) VALUES ('Ακκορντεόν', "par");
INSERT INTO instruments (name, type) VALUES ('Σολφέζ', "eur");
INSERT INTO instruments (name, type) VALUES ('Φωνητική - Ορθοφωνία', "eur");
INSERT INTO instruments (name, type) VALUES ('Θεωρία Ευρωπαϊκής Μουσικής', "eur");
INSERT INTO instruments (name, type) VALUES ('Πιάνο', "eur");
INSERT INTO instruments (name, type) VALUES ('Αρμόνιο', "eur");

INSERT INTO teacher_instruments SET instrument_id = 1, teacher_id = 1;
INSERT INTO teacher_instruments SET instrument_id = 2, teacher_id = 1;
INSERT INTO teacher_instruments SET instrument_id = 3, teacher_id = 1;
INSERT INTO teacher_instruments SET instrument_id = 6, teacher_id = 2;
INSERT INTO teacher_instruments SET instrument_id = 7, teacher_id = 2;
INSERT INTO teacher_instruments SET instrument_id = 8, teacher_id = 2;
INSERT INTO teacher_instruments SET instrument_id = 9, teacher_id = 2;
INSERT INTO teacher_instruments SET instrument_id = 12, teacher_id = 3;
INSERT INTO teacher_instruments SET instrument_id = 13, teacher_id = 3;
INSERT INTO teacher_instruments SET instrument_id = 14, teacher_id = 3;
INSERT INTO teacher_instruments SET instrument_id = 15, teacher_id = 3;
INSERT INTO teacher_instruments SET instrument_id = 16, teacher_id = 4;
INSERT INTO teacher_instruments SET instrument_id = 17, teacher_id = 4;
INSERT INTO teacher_instruments SET instrument_id = 18, teacher_id = 4;
INSERT INTO teacher_instruments SET instrument_id = 19, teacher_id = 4;
INSERT INTO teacher_instruments SET instrument_id = 30, teacher_id = 5;
INSERT INTO teacher_instruments SET instrument_id = 31, teacher_id = 5;
INSERT INTO teacher_instruments SET instrument_id = 33, teacher_id = 5;


-- ALTER TABLE `locations` ADD COLUMN `manager` varchar(80) AFTER `municipality`;