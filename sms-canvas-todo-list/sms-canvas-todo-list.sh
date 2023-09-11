#!/bin/bash

# This is a script to send daily assignment notifications via SMS using Twilio.
# It fetches TODO list data from the Canvas LMS API, sorts it by due date,
# formats it, and sends an SMS notification to specified phone numbers.
# For: <Person's> assignments; sends to <Recipient 1> and <Recipient 2>.

# Variables for Twilio account credentials and sender phone number
TWILIO_ACCOUNT_SID="<Twilio Account SID>" # Account SID for the Twilio account sending the message.
TWILIO_AUTH_TOKEN="<Twilio Auth Token>" # Authentication token for the Twilio account sending the message.
TWILIO_PHONE_NUMBER="+##########" # Phone number of the Twilio account sending the message. Must include country code and no spaces (ex: +12065555555).

# Variables for text message recipient(s)
RECIPIENT1_PHONE_NUMBER="+##########" # Phone number of person you want to send the todo list to.
RECIPIENT2_PHONE_NUMBER="+##########" # Phone number of another person you want to send the todo list to. If you do not wnat to include a second person, you can remove this line and the references to RECIPIENT_PHONE_NUMBER2 below.

# Variable for Canvas API endpoint for the TODO list
API_URL_TODO="https://<domain>.instructure.com/api/v1/users/self/todo" # Replace <domain> with your Canvas domain.

# Variable for Canvas API authentication token
API_AUTH_TOKEN="<Canvas API authentication token>"  # Replace with your Canvas API authentication token.

# Call the API with authentication and get the JSON response
api_response_todo=$(curl -s -H "Authorization: Bearer $API_AUTH_TOKEN" "$API_URL_TODO")
# echo "API queried" # Uncomment if you want to troubleshoot and verify that the API was queried.

# Get the current date in YYYY-MM-DD format
current_date=$(date +"%Y-%m-%d")
# echo "Date retrieved" # Uncomment if you want to troubleshoot and verify that the date was retrieved.

# Extract required properties using jq with preprocessed date
parsed_data=$(echo "$api_response_todo" | jq -r '.[] | [.type, .assignment.name, .assignment.due_at, .assignment.course_id, .context_type, .course_id] | @tsv')
# echo "API response parsed" # Uncomment if you want to troubleshoot and verify that the API response was parsed.

# Define a function to convert ISO 8601 date to a sortable timestamp
convert_date() {
    date -u -d "$1" +%s
}

# Sort parsed_data in chronological order based on .assignment.due_at (3rd column)
sorted_parsed_data=$(echo "$parsed_data" | sort -t$'\t' -k3,3 -k2,2)
# echo "$sorted_parsed_data" # Uncomment if you want to troubleshoot and verify that the sorted parsed data was actually sorted.

# Preprocess the date string within the parsed_data
formatted_data=$(echo "$sorted_parsed_data" | awk -F'\t' '{
    gsub(/[^0-9TZ-]/, "", $3);
    split($3, datetime, "T");
    split(datetime[1], date, "-");
    formatted_date = date[1] "-" date[2] "-" date[3];
    print $1"\t"$2"\t"formatted_date"\t"$4"\t"$5"\t"$6"\t"$7
}')

# Verify parsed_data content
# echo "Parsed data:" # Uncomment if you are going to use the echo line below and want a header above.
# echo "$formatted_data" # Uncomment if you want to troubleshoot and verify that the parsed data was formatted as expected.

# Loop through parsed data and format the course_id to a more readable format. Will print in the order of the sorted_parsed_data (due soonest to latest)
message="Assignments for $current_date:

"
IFS=$'\n'
for line in $formatted_data; do
    IFS=$'\t' read -ra fields <<< "$line"

    type="${fields[0]}"
    # echo "Type: $type" 

    assignment_name="${fields[1]}"
    # echo "Assignment: $assignment_name"

    formatted_date="${fields[2]}"
    # echo "Assignment Due: $assignment_due_at"

    assignment_course_id="${fields[3]}"
    # echo "Assignment Course ID: $assignment_course_id"

    # html_url="${fields[4]}"
    # echo "URL: $html_url"

    context_type="${fields[5]}"
    # echo "Context Type: $context_type"

    course_id="${fields[6]}"
    # echo "Course ID: $course_id"

    # Format course_id if needed
    if [[ $assignment_course_id == 00000 ]]; then # Update the course ID to a course.
        formatted_course_id="<Course Name for 00000>" # Update the course name to the course name for the course ID above.
        # echo "Course ID updated to <Readable Course Name for 00000 like 'English'>" # Uncomment if you want to troubleshoot and verify that course IDs of this number were updated.
    elif [[ $assignment_course_id == 11111 ]]; then # Update the course ID to a course.
        formatted_course_id="<Course Name for 11111>" # Update the course name to the course name for the course ID above.
        # echo "Course ID updated to <Readable Course Name for 11111 like 'Pre-Cal'>" # Uncomment if you want to troubleshoot and verify that course IDs of this number were updated.
    elif [[ $assignment_course_id == 22222 ]]; then # Update the course ID to a course.
        formatted_course_id="<Course Name for 22222>" # Update the course name to the course name for the course ID above.
        # echo "Course ID updated to <Readable Course Name for 22222 like 'US History'>" # Uncomment if you want to troubleshoot and verify that course IDs of this number were updated.
    elif [[ $assignment_course_id == 33333 ]]; then # Update the course ID to a course.
        formatted_course_id="<Course Name for 33333>" # Update the course name to the course name for the course ID above.
        # echo "Course ID updated to <Readable Course Name for 33333 like 'Eng Design'>" # Uncomment if you want to troubleshoot and verify that course IDs of this number were updated.
    elif [[ $assignment_course_id == 44444 ]]; then # Update the course ID to a course.
        formatted_course_id="<Course Name for 44444>" # Update the course name to the course name for the course ID above.
        # echo "Course ID updated to <Readable Course Name for 44444 like 'Chemistry'>" # Uncomment if you want to troubleshoot and verify that course IDs of this number were updated.
    elif [[ $assignment_course_id == 55555 ]]; then # Update the course ID to a course.
        formatted_course_id="<Course Name for 55555>" # Update the course name to the course name for the course ID above.
        # echo "Course ID updated to <Readable Course Name for 55555 like 'Woodshop'>" # Uncomment if you want to troubleshoot and verify that course IDs of this number were updated.
    else
        formatted_course_id="$assignment_course_id"
        # echo "Course ID not updated" # Uncomment if you want to troubleshoot and verify that all other course IDs not listed above were not updated.
    fi

    # Construct message
    message+="
Course: $formatted_course_id
Assignment: $assignment_name
Type: $type
Due: $formatted_date

"
done

echo "Message: $message"
# echo "Message constructed" # Uncomment if you want to troubleshoot and verify that the message was constructed as expected.

# Send Twilio message to RECIPIENT1_PHONE_NUMBER - PROTIP: COMMENT THIS OUT WHILE TESTING THE LIST ABOVE IS WORKING AND FORMATTED AS EXPECTED SO YOU DON'T SEND TOO MANY MESSAGES AND GET YOUR TWILIO ACCOUNT SUSPENDED.
 twilio_response=$(curl -X POST "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Messages.json" \
   --data-urlencode "To=$RECIPIENT1_PHONE_NUMBER" \
   --data-urlencode "From=$TWILIO_PHONE_NUMBER" \
   --data-urlencode "Body=$message" \
   -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN")

# Send Twilio message to RECIPIENT2_PHONE_NUMBER - PROTIP: COMMENT THIS OUT WHILE TESTING THE LIST ABOVE IS WORKING AND FORMATTED AS EXPECTED SO YOU DON'T SEND TOO MANY MESSAGES AND GET YOUR TWILIO ACCOUNT SUSPENDED.
 twilio_response2=$(curl -X POST "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Messages.json" \
   --data-urlencode "To=$RECIPIENT2_PHONE_NUMBER" \
   --data-urlencode "From=$TWILIO_PHONE_NUMBER" \
   --data-urlencode "Body=$message" \
   -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN")

# Check if the message was sent successfully to RECIPIENT1_PHONE_NUMBER
if [[ $(echo "$twilio_response" | jq -r '.sid') != "null" ]]; then
    echo "Message sent successfully."
else
    echo "Failed to send message.     
   Twilio response:
   $twilio_response"
fi

# Check if the message was sent successfully to RECIPIENT2_PHONE_NUMBER
if [[ $(echo "$twilio_response2" | jq -r '.sid') != "null" ]]; then
    echo "Message sent successfully."
else
    echo "Failed to send message.     
   Twilio response:
   $twilio_response"
fi
