Debt Management API Server

A simple REST API built with Node.js and Express.js for retrieving debt records. This server uses sample debt data for testing and provides a GET endpoint to return all recorded debts in JSON format.

Features
Built with Node.js and Express.js.
Supports Cross-Origin Resource Sharing (CORS).
Parses incoming JSON requests.
Provides an API endpoint to retrieve all debt records.
Returns debt information in JSON format.
Uses environment variables to configure the server port.
Includes temporary sample data for testing.
Technologies Used
Node.js – JavaScript runtime environment.
Express.js – Web framework for building the API.
CORS – Allows requests from different origins.
dotenv – Loads environment variables from a .env file.
Project Structure
project-folder/
├── server.js
├── package.json
├── package-lock.json
├── .env
└── README.md

Prerequisites

Before running the server, make sure you have installed:

Node.js
npm (included with Node.js)
Installation and Setup
1. Clone or Download the Project

Download the project or clone its repository to your local machine.

2. Open the Project Folder

Open a terminal in the project directory.

3. Initialize the Project (if needed)

If the project does not have a package.json file, run:

npm init -y

4. Install Dependencies

Run the following command to install the required packages:

npm install express cors dotenv

5. Configure Environment Variables

Create a .env file in the root directory:

PORT=5000


The server will use port 5000 by default if the PORT environment variable is not configured.

6. Start the Server

Run the following command:

node server.js


If the server starts successfully, the terminal will display:

Server is running on http://localhost:5000

API Documentation
Get All Debt Records

Retrieves all available debt records.

Endpoint: /api/debts
Method: GET
Response Format: JSON
Success Status Code: 200 OK

Request URL:

http://localhost:5000/api/debts


Example Response:

{
  "success": true,
  "count": 2,
  "data": [
    {
      "id": 1,
      "name": "Juan Dela Cruz",
      "amount": 1500,
      "date": "2026-10-12",
      "description": "School expenses",
      "status": "Unpaid"
    },
    {
      "id": 2,
      "name": "Maria Santos",
      "amount": 800,
      "date": "2026-10-11",
      "description": "Food expenses",
      "status": "Unpaid"
    }
  ]
}

Response Fields
Field	Description
success	Indicates whether the request was successful.
count	Total number of debt records returned.
data	Array containing the debt records.
id	Unique identifier for each debt record.
name	Name of the person who owes the debt.
amount	Debt amount.
date	Date associated with the debt, in YYYY-MM-DD format.
description	Purpose or details of the debt.
status	Current debt payment status, such as Unpaid.
Testing the API

You can test the endpoint using a browser, Postman, or a frontend application.

Start the server using node server.js.
Open Postman.
Select the GET request method.
Enter http://localhost:5000/api/debts.
Click Send.
Check the JSON response containing the debt records.

You can also open the URL directly in your browser while the server is running.

Current Limitations
Temporary data: Debt records are stored in a JavaScript array inside server.js.
No database: Records are not saved permanently and will reset to the original sample data whenever the server restarts.
Read-only API: The current implementation only supports retrieving debt records. It does not yet support creating, updating, or deleting records.
No authentication: The endpoint does not require users to log in or provide authorization credentials.
Future Improvements

Possible enhancements include:

Connect the API to a database such as MySQL, PostgreSQL, or MongoDB.
Add endpoints to create, update, and delete debt records.
Implement debt payment tracking.
Add input validation and error handling.
Implement authentication and authorization.
Add search and filtering by name, date, or payment status.
License

This project is intended for educational and development purposes. Add an appropriate license if you plan to distribute or publish it.