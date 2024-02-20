# this is a service to sync freshservice & jira

Data Mapping:

We meticulously mapped data between the two systems:
Freshservice Tickets ⟷ Jira Issues
- Subject ⟷ Issue Title
- Description ⟷ Issue Description
- Status ⟷ Issue Status
- Comments ⟷ Issue Comments
- Attachments ⟷ Issue Attachments
  
Trigger Events:
We made the integration responsive to key events:
- New Ticket/Issue Creation - Status Change
- New Comment or Note
- New Attachment


This project leveraged Node JS to create a robust solution that met our synchronization needs. By using webhooks, we established a seamless flow of data between Freshservice and Jira, ensuring that our teams were always on the same page.

This project exemplifies our commitment to efficiency, collaboration, and innovation. It's a testament to our dedication to providing our teams with the tools they need to excel in a dynamic and interconnected work environment.
