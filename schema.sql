-- DROP TABLES

ALTER TABLE `books` DROP CONSTRAINT `FK_book_wholesaler`;
ALTER TABLE `payments` DROP CONSTRAINT `FK_payment_book`;
ALTER TABLE `school_payoffs` DROP CONSTRAINT `FK_school_wholesaler`;
ALTER TABLE `classes` DROP CONSTRAINT `FK_class_teacher`;
ALTER TABLE `classes` DROP CONSTRAINT `FK_class_type`;
ALTER TABLE `teacher_locations` DROP CONSTRAINT `FK_teacher_locations_teacher_id`;
ALTER TABLE `teacher_locations` DROP CONSTRAINT `FK_teacher_locations_location_id`;
ALTER TABLE `registrations` DROP CONSTRAINT `FK_registration_class`;

DROP TABLE IF EXISTS `registrations`;
DROP TABLE IF EXISTS `books`;
DROP TABLE IF EXISTS `wholesalers`;
DROP TABLE IF EXISTS `payments`;
DROP TABLE IF EXISTS `school_payoffs`;
DROP TABLE IF EXISTS `locations`;
DROP TABLE IF EXISTS `teachers`;
DROP TABLE IF EXISTS `class_type`;
DROP TABLE IF EXISTS `classes`;
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
PRIMARY KEY (`id`),
CONSTRAINT `FK_book_wholesaler` FOREIGN KEY (wholesaler_id) REFERENCES wholesalers(id))
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
    `id` int NOT NULL AUTO_INCREMENT,
    `student_name` varchar(80) NOT NULL,
    `book_id` int NOT NULL,
    `amount` int NOT NULL,
    `date` bigint NOT NULL,
PRIMARY KEY (`id`),
CONSTRAINT `FK_payment_book` FOREIGN KEY (book_id) REFERENCES books(id))
CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Generate 10 payments
INSERT INTO payments (student_name, book_id, amount, date) VALUES ("Jane Smith", 1, 15, 1686580312656);
INSERT INTO payments (student_name, book_id, amount, date) VALUES ("John Doe", 2, 12, 1686580312655);
INSERT INTO payments (student_name, book_id, amount, date) VALUES ("Michael Johnson", 3, 25, 1686580312657);
INSERT INTO payments (student_name, book_id, amount, date) VALUES ("Emily Davis", 4, 20, 1686580312658);
INSERT INTO payments (student_name, book_id, amount, date) VALUES ("Daniel Wilson", 6, 13, 1686580312659);
INSERT INTO payments (student_name, book_id, amount, date) VALUES ("Olivia Thompson", 6, 13, 1686580312660);
INSERT INTO payments (student_name, book_id, amount, date) VALUES ("William Martinez", 8, 17, 1686580312661);
INSERT INTO payments (student_name, book_id, amount, date) VALUES ("Sophia Anderson", 8, 17, 1686580312662);
INSERT INTO payments (student_name, book_id, amount, date) VALUES ("James Taylor", 10, 15, 1686580312663);
INSERT INTO payments (student_name, book_id, amount, date) VALUES ("Emma Hernandez", 10, 15, 1686580312664);

CREATE TABLE `school_payoffs` (
    `id` int NOT NULL AUTO_INCREMENT,
    `wholesaler_id` int NOT NULL,
    `amount` int NOT NULL,
    PRIMARY KEY (`id`),
    CONSTRAINT `FK_school_wholesaler` FOREIGN KEY (wholesaler_id) REFERENCES wholesalers(id))
AUTO_INCREMENT=0 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO school_payoffs (wholesaler_id, amount) VALUES (1, 390);
INSERT INTO school_payoffs (wholesaler_id, amount) VALUES (2, 360);
INSERT INTO school_payoffs (wholesaler_id, amount) VALUES (3, 800);
INSERT INTO school_payoffs (wholesaler_id, amount) VALUES (4, 200);
INSERT INTO school_payoffs (wholesaler_id, amount) VALUES (5, 900);
INSERT INTO school_payoffs (wholesaler_id, amount) VALUES (6, 200);
INSERT INTO school_payoffs (wholesaler_id, amount) VALUES (7, 900);
INSERT INTO school_payoffs (wholesaler_id, amount) VALUES (8, 165);
INSERT INTO school_payoffs (wholesaler_id, amount) VALUES (9, 300);

CREATE TABLE `locations` (
    `id` int NOT NULL AUTO_INCREMENT,
    `name` varchar(80) NOT NULL,
    `address` varchar(80) NOT NULL,
    `number` int NOT NULL,
    `areacode` int NOT NULL,
    `municipality` varchar(80) NOT NULL,
    `image` varchar(80),
    `link` varchar(400) NOT NULL,
    PRIMARY KEY (`id`)
)AUTO_INCREMENT=0 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT INTO locations (name, address, number, areacode, municipality, link) VALUES ("Μεταμορφώσεως", "Χλόης 1", 123, 1234, "Μεταμόρφωσης", "https://maps.google.com");
INSERT INTO locations (name, address, number, areacode, municipality, link) VALUES ("Πέυκης", "Παπανδρέου 28", 123, 1234, "Πέυκης", "https://maps.google.com");
INSERT INTO locations (name, address, number, areacode, municipality, link) VALUES ("Εκάλης", "Αγίου Ιωάννου 17", 123, 1234, "Εκάλης", "https://maps.google.com");
INSERT INTO locations (name, address, number, areacode, municipality, link) VALUES ("Κηφισιάς", "Λεωφόρος Κηφισίας 12", 123, 1234, "Κηφισιάς", "https://maps.google.com");

CREATE TABLE `teachers` (
    `id` int NOT NULL AUTO_INCREMENT,
    `fullname` varchar(80) NOT NULL,
    `email` varchar(40) NOT NULL,
    `cellphone` varchar(20) NOT NULL,
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

CREATE TABLE `teacher_locations` (
    `teacher_id` int NOT NULL,
    `location_id` int NOT NULL,
    CONSTRAINT FK_teacher_locations_teacher_id FOREIGN KEY (teacher_id) REFERENCES teachers(id),
    CONSTRAINT FK_teacher_locations_location_id FOREIGN KEY (location_id) REFERENCES locations(id),
    PRIMARY KEY (`teacher_id`, `location_id`)
);

CREATE TABLE `classes` (
    `teacher_id` int NOT NULL,
    `class_id` int NOT NULL,
    CONSTRAINT FK_class_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id),
    CONSTRAINT FK_class_type FOREIGN KEY (class_id) REFERENCES class_type(id),
    PRIMARY KEY (`teacher_id`, `class_id`)
);

INSERT INTO class_type (name) VALUES ('Βυζαντινή Μουσική');
INSERT INTO class_type (name) VALUES ('Παραδοσιακή Μουσική');
INSERT INTO class_type (name) VALUES ('Ευρωπαϊκή Μουσική');

INSERT INTO teachers (fullname, email, cellphone) VALUES ('John Doe', 'john@doe.com', '6987654321');
INSERT INTO teachers (fullname, email, cellphone) VALUES ('Jane Doe', 'jane@doe.com', '6987654322');
INSERT INTO teachers (fullname, email, cellphone) VALUES ('Michael Johnson', 'john@son.com', '6987654323');
INSERT INTO teachers (fullname, email, cellphone) VALUES ('Emily Davis', 'davis@emy.com', '6987654324');

INSERT INTO classes (teacher_id, class_id) VALUES (1, 1);
INSERT INTO classes (teacher_id, class_id) VALUES (1, 2);
INSERT INTO classes (teacher_id, class_id) VALUES (2, 1);
INSERT INTO classes (teacher_id, class_id) VALUES (2, 3);
INSERT INTO classes (teacher_id, class_id) VALUES (3, 2);
INSERT INTO classes (teacher_id, class_id) VALUES (3, 3);
INSERT INTO classes (teacher_id, class_id) VALUES (4, 1);
INSERT INTO classes (teacher_id, class_id) VALUES (4, 2);
INSERT INTO classes (teacher_id, class_id) VALUES (4, 3);

INSERT INTO teacher_locations (teacher_id, location_id) VALUES (1, 1);
INSERT INTO teacher_locations (teacher_id, location_id) VALUES (1, 2);
INSERT INTO teacher_locations (teacher_id, location_id) VALUES (2, 3);
INSERT INTO teacher_locations (teacher_id, location_id) VALUES (2, 4);
INSERT INTO teacher_locations (teacher_id, location_id) VALUES (3, 1);
INSERT INTO teacher_locations (teacher_id, location_id) VALUES (3, 3);
INSERT INTO teacher_locations (teacher_id, location_id) VALUES (4, 2);
INSERT INTO teacher_locations (teacher_id, location_id) VALUES (4, 4);

CREATE TABLE `registrations`(
    `id` int NOT NULL,
    `lastName` varchar(80) NOT NULL,
    `firstName` varchar(40) NOT NULL,
    `am` varchar(4) NOT NULL,
    `fathers_name` varchar(40) NOT NULL,
    `birth_year` int NOT NULL,
    `road` varchar(80) NOT NULL,
    `number` int NOT NULL,
    `tk` int NOT NULL,
    `region` varchar(80) NOT NULL,
    `telephone` varchar(20) NOT NULL,
    `cellphone` varchar(20) NOT NULL,
    `email` varchar(40) NOT NULL,
    `registration_year` varchar(40) NOT NULL,
    `class_year` varchar(40) NOT NULL,
    `teacher_id` INT NOT NULL,
    `class_id` int NOT NULL,
    `date` bigint NOT NULL,
    CONSTRAINT FK_registration_class FOREIGN KEY (class_id) REFERENCES class_type(id),
    CONSTRAINT FK_registration_teacher FOREIGN KEY (teacher_id) REFERENCES teachers(id),
    PRIMARY KEY (`cellphone`, `am`, `class_id`)
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
INSERT INTO sys_users (email, password, privilege) VALUES ('dummy@user.com', 'dummyuser', 1);
INSERT INTO sys_users (email, password) VALUES ('dummy2@user.com', 'dummyuser2');

CREATE TABLE `sys_user_register_links` (
    `link` varchar(80) NOT NULL,
    `exp_date` bigint NOT NULL,
    `privilege` int NOT NULL,
    PRIMARY KEY (`link`))
DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
