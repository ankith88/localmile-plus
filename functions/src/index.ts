import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError, onRequest } from "firebase-functions/v2/https";
import { onDocumentUpdated, onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import * as nodemailer from "nodemailer";
import { connect, ImapSimple } from "imap-simple";
import { simpleParser } from "mailparser";
import express from "express";
import cors from "cors";
import * as crypto from "crypto";
// Initialize admin once
if (admin.apps.length === 0) {
  admin.initializeApp();
}

// Set global options
setGlobalOptions({ region: "us-central1", invoker: "public" });

// Database helper - Specify the named database if needed
const getDB = () => getFirestore();

// Secrets
const gmailAppPassword = defineSecret("GMAIL_APP_PASSWORD");
const netsuiteApiKey = defineSecret("NETSUITE_API_KEY");
const prospectplusApiKey = defineSecret("PROSPECTPLUS_API_KEY");
const geminiApiKey = defineSecret("GEMINI_API_KEY"); // For AI summarization

// Communication Helpers
const logCommunication = async (data: {
  from: string;
  to: string | string[];
  subject: string;
  body: string;
  type: 'sent' | 'received';
  metadata: any;
  threadId?: string;
  timestamp?: Date;
}) => {
  const db = getDB();
  const metadata = { ...(data.metadata || {}) };

  // 1. Enrich LPO Name if missing
  if (metadata.parentId && !metadata.lpoName) {
    try {
      const lpoDoc = await db.collection("lpo").doc(metadata.parentId).get();
      if (lpoDoc.exists) {
        metadata.lpoName = lpoDoc.data()?.name;
      }
    } catch (e) {
      console.error("[Enrichment] LPO error:", e);
    }
  }

  // 2. Enrich Customer Name (Company Name) if missing
  if (metadata.customerId && !metadata.companyName) {
    try {
      const cid = metadata.customerId;
      const cidStr = cid.toString();
      const cidNum = parseInt(cidStr);

      let custData: any = null;

      if (metadata.parentId) {
        // Look in LPO subcollection
        const custQuery = db.collection("lpo").doc(metadata.parentId).collection("customers");
        let custSnap = await custQuery.where("companyId", "in", [cidStr, cidNum]).limit(1).get();
        if (custSnap.empty) {
          custSnap = await custQuery.where("customerInternalId", "in", [cidStr, cidNum]).limit(1).get();
        }
        if (!custSnap.empty) {
          custData = custSnap.docs[0].data();
        }
      } else {
        // Look in top-level customers collection
        const custDoc = await db.collection("customers").doc(cidStr).get();
        if (custDoc.exists) {
          custData = custDoc.data();
        }
      }

      if (custData) {
        metadata.companyName = custData.companyName || custData.company_name;
      }
    } catch (e) {
      console.error("[Enrichment] Customer error:", e);
    }
  }

  await db.collection("communications").add({
    ...data,
    metadata,
    timestamp: data.timestamp || admin.firestore.FieldValue.serverTimestamp(),
    processedAt: admin.firestore.FieldValue.serverTimestamp(),
    threadId: data.threadId || `thread_${Date.now()}`
  });
};

const injectMetadataTag = (html: string, metadata: any) => {
  if (!metadata) return html;
  const tag = `\n<!-- LPO_CONNECT_METADATA: ${JSON.stringify(metadata)} -->`;
  return html + tag;
};

function extractStringId(refOrString: any): string | undefined {
  if (!refOrString) return undefined;
  if (typeof refOrString === 'string') return refOrString;
  if (typeof refOrString === 'object' && refOrString.id) return refOrString.id;
  return String(refOrString);
}

// Logic: onJobRequestCreated (Email Automation / ProspectPlus Integration)
export const onJobRequestCreated = onDocumentCreated({
  document: "requests/{requestId}",
  database: "(default)",
  secrets: [gmailAppPassword, prospectplusApiKey],
}, async (event) => {
  const snapshot = event.data;
  const requestId = event.params.requestId;
  console.log(`[Trigger Check] onJobRequestCreated triggered for ID: ${requestId}`);

  if (!snapshot) {
    console.error(`[Trigger Error] No snapshot data for request ${requestId}`);
    return;
  }
  
  const afterData = snapshot.data();
  if (!afterData) return;

  const uid = afterData.uid;
  const db = getDB();
  let leadId = afterData.customer_id;

  let userFirstName = "";
  let userLastName = "";
  let userEmail = "";
  let userPhone = "";

  if (uid) {
    try {
      const userDoc = await db.collection("users").doc(uid).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        leadId = leadId || userData?.customer_id;
        userFirstName = userData?.first_name || "";
        userLastName = userData?.last_name || "";
        userEmail = userData?.email || "";
        userPhone = userData?.mobile || "";
      }
    } catch (err) {
      console.error("[onJobRequestCreated] Error getting user:", err);
    }
  }

  let needsUpdate = false;
  const updatedCustomer = { ...(afterData.customer || {}) };

  if (userEmail && updatedCustomer.email !== userEmail) {
    updatedCustomer.email = userEmail;
    needsUpdate = true;
  }
  if (userPhone && updatedCustomer.phone !== userPhone) {
    updatedCustomer.phone = userPhone;
    needsUpdate = true;
  }
  if (userFirstName && updatedCustomer.firstName !== userFirstName) {
    updatedCustomer.firstName = userFirstName;
    needsUpdate = true;
  }
  if (userLastName && updatedCustomer.lastName !== userLastName) {
    updatedCustomer.lastName = userLastName;
    needsUpdate = true;
  }

  if (needsUpdate) {
    try {
      await snapshot.ref.update({ customer: updatedCustomer });
      console.log(`[onJobRequestCreated] Updated customer fields for request ${requestId}`);
    } catch (err) {
      console.error("[onJobRequestCreated] Error updating request customer fields:", err);
    }
  }

  if (!leadId) {
    console.warn(`[onJobRequestCreated] No leadId found for job request ${requestId}.`);
  }

  /*
    const customerEmail = afterData.customer?.email;
    const companyName = data.customer?.company || "Unknown Company";
    const firstName = data.customer?.firstName || "there";
    const serviceType = data.service || "Standard Service";
    const date = data.date || "To be confirmed";
  
    if (!customerEmail) {
      console.warn(`No customer email found for request ${requestId}. Skipping email confirmation.`);
      return;
    }
  
    console.log(`[Email Automation] Preparing confirmation for ${customerEmail} (Request: ${requestId})`);
  
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "bookings@localmile.plus",
        pass: gmailAppPassword.value(),
      },
    });
  
    // Format service name for display
    const displayService = typeof serviceType === 'string' 
      ? serviceType.replace(/-/g, ' ').toUpperCase() 
      : "SERVICE REQUESTED";
  
    const mailOptions = {
      from: '"LocalMile.Plus Bookings" <bookings@localmile.plus>',
      to: customerEmail,
      replyTo: "bookings@localmile.plus",
      subject: `Booking Confirmation: ${companyName} (${displayService})`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            .email-container {
              font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
              max-width: 600px;
              margin: 0 auto;
              background-color: #ffffff;
              border-radius: 12px;
              overflow: hidden;
              box-shadow: 0 4px 15px rgba(0,0,0,0.05);
              border: 1px solid #f0f0f0;
            }
            .header {
              background-color: #095c7b;
              padding: 40px 20px;
              text-align: center;
            }
            .header h1 {
              color: #ffffff;
              margin: 0;
              font-size: 24px;
              font-weight: 300;
              letter-spacing: 1px;
            }
            .header span {
              color: #EAF044;
              font-weight: bold;
            }
            .content {
              padding: 40px 30px;
              color: #333333;
              line-height: 1.6;
            }
            .greeting {
              font-size: 18px;
              margin-bottom: 20px;
              color: #095c7b;
            }
            .job-details {
              background-color: #f8fafb;
              border-radius: 8px;
              padding: 25px;
              margin: 30px 0;
              border-left: 4px solid #EAF044;
            }
            .detail-row {
              margin-bottom: 12px;
              display: flex;
            }
            .detail-label {
              font-weight: bold;
              width: 120px;
              color: #666;
              font-size: 13px;
              text-transform: uppercase;
            }
            .detail-value {
              color: #095c7b;
              font-weight: 600;
            }
            .button-container {
              text-align: center;
              margin: 40px 0;
            }
            .btn-primary {
              background-color: #EAF044;
              color: #095c7b;
              padding: 16px 32px;
              text-decoration: none;
              font-weight: bold;
              border-radius: 8px;
              display: inline-block;
              transition: background 0.3s;
              box-shadow: 0 4px 12px rgba(234, 240, 68, 0.3);
            }
            .footer {
              background-color: #f4f7f8;
              padding: 30px;
              text-align: center;
              font-size: 12px;
              color: #999;
            }
            .footer p {
              margin: 5px 0;
            }
            .social-links {
              margin-top: 20px;
            }
          </style>
        </head>
        <body>
          <div class="email-container">
            <div class="header">
              <h1>LocalMile<span>.Plus</span></h1>
            </div>
            <div class="content">
              <div class="greeting">Booking Received</div>
              <p>Hello ${firstName},</p>
              <p>Thank you for choosing LocalMile.Plus. We have received your job request for <strong>${companyName}</strong> and it is currently being processed by our dispatch team.</p>
              
              <div class="job-details">
                <div class="detail-row">
                  <span class="detail-label">Reference:</span>
                  <span class="detail-value">#${requestId.substring(0, 8).toUpperCase()}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Service:</span>
                  <span class="detail-value">${displayService}</span>
                </div>
                <div class="detail-row">
                  <span class="detail-label">Date:</span>
                  <span class="detail-value">${date}</span>
                </div>
              </div>
  
              <p>You can track the live status of your request, view logistics details, or chat directly with your operator through our portal.</p>
              
              <!--
              <div class="button-container">
                <a href="https://localmile-plus.web.app/request/${requestId}" class="btn-primary">
                  VIEW JOB DETAILS
                </a>
              </div>
              -->
  
              <p style="font-size: 14px; color: #666;">If you need to make any urgent changes, please reply to this email or use the chat feature in the portal.</p>
            </div>
            <div class="footer">
              <p><strong>LocalMile.Plus</strong> | Premium Logistics Solutions</p>
              <p>Powered by MailPlus Australia</p>
              <p style="margin-top: 15px;">&copy; ${new Date().getFullYear()} LocalMile.Plus. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };
  
    try {
      const info = await transporter.sendMail(mailOptions);
      console.log(`[Email Success] Confirmation sent to ${customerEmail}. Message ID: ${info.messageId}`);
    } catch (error) {
      console.error(`[Email Error] Failed to send confirmation to ${customerEmail}:`, error);
      // Log more details if it's an auth error
      if (error instanceof Error && error.message.includes('Invalid login')) {
        console.error("CRITICAL: Gmail SMTP Authentication failed. Please verify the GMAIL_APP_PASSWORD secret.");
      }
    }
  */
});

// Logic: onJobCreated (ProspectPlus Integration)
export const onJobCreated = onDocumentCreated({
  document: "jobs/{jobId}",
  database: "(default)",
  secrets: [prospectplusApiKey],
}, async (event) => {
  const snapshot = event.data;
  const jobId = event.params.jobId;

  if (!snapshot) return;
  const afterData = snapshot.data();
  if (!afterData) return;

  const uid = afterData.uid;
  const db = getDB();
  let leadId = extractStringId(afterData.customer_id);

  if (!leadId && uid) {
    try {
      const userDoc = await db.collection("users").doc(uid).get();
      if (userDoc.exists) {
        leadId = extractStringId(userDoc.data()?.customer_id);
      }
    } catch (err) {
      console.error("[onJobCreated] Error getting user customer_id:", err);
    }
  }

  if (leadId) {
    const pickupStop = afterData.stops?.find((s: any) => s.type === "pickup");
    const deliveryStop = afterData.stops?.find((s: any) => s.type === "delivery");
    const pickupSuburb = pickupStop?.suburb || "";
    const deliverySuburb = deliveryStop?.suburb || "";
    const price = afterData.serviceRate || (afterData.service === "round-trip" ? "20.00" : "10.00");

    console.log(`[onJobCreated] Job created for leadId ${leadId}. Pushing to ProspectPlus API...`);
    try {
      const response = await fetch(`https://prospectplus.com.au/api/localmile/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": prospectplusApiKey.value()
        },
        body: JSON.stringify({
          leadId,
          jobId: jobId,
          service: afterData.service || "Outgoing Mail Lodgement",
          pickupSuburb,
          deliverySuburb,
          price
        })
      });

      if (!response.ok) {
        console.error("[onJobCreated] Failed to push created job:", await response.text());
      } else {
        console.log(`[onJobCreated] Successfully logged created job for leadId ${leadId}`);
      }
    } catch (error) {
      console.error("[onJobCreated] Error pushing created job:", error);
    }
  } else {
    console.warn(`[onJobCreated] No leadId found for job ${jobId}. Skipping ProspectPlus API call.`);
  }
});

// Logic: onJobStatusUpdated
export const onJobStatusUpdated = onDocumentUpdated({
  document: "jobs/{jobId}",
  database: "(default)",
  secrets: [prospectplusApiKey],
}, async (event) => {
  const afterData = event.data?.after.data();
  const beforeData = event.data?.before.data();

  if (!afterData || !beforeData) return;

  const statusAfter = afterData.status;
  const statusBefore = beforeData.status;
  
  if (statusAfter === statusBefore) return;

  const targetStatuses = ["completed", "in-progress", "in progress"];
  const isTargetStatus = targetStatuses.includes(statusAfter);

  if (isTargetStatus) {
    const uid = afterData.uid;
    const db = getDB();
    let leadId = extractStringId(afterData.customer_id);

    if (!leadId && uid) {
      try {
        const userDoc = await db.collection("users").doc(uid).get();
        if (userDoc.exists) {
          leadId = extractStringId(userDoc.data()?.customer_id);
        }
      } catch (err) {
        console.error("[onJobStatusUpdated] Error getting user customer_id:", err);
      }
    }

    if (!leadId) {
      console.warn(`[Lead Update] No leadId found for job ${event.params.jobId}. Skipping API calls.`);
      return;
    }

    // 1. Update Lead Bucket
    if (uid) {
      const userRef = db.collection("users").doc(uid);
      const userDoc = await userRef.get();

      if (userDoc.exists) {
        const userData = userDoc.data();
        if (userData?.role === "customer" && !userData?.leadBucketUpdated) {
          // Mark as updated so future jobs won't trigger this again for the same user
          await userRef.update({ leadBucketUpdated: true });

          console.log(`[Lead Update] 1st job for customer ${uid} reached ${statusAfter}. Calling ProspectPlus API for lead ${leadId}.`);

          try {
            const response = await fetch(`https://prospectplus.com.au/api/leads/${leadId}`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": prospectplusApiKey.value()
              },
              body: JSON.stringify({
                bucket: "account_manager"
              })
            });

            if (!response.ok) {
              console.error("[Lead Update] Failed to update lead bucket:", await response.text());
            } else {
              console.log(`[Lead Update] Successfully updated lead bucket for leadId ${leadId}`);
            }
          } catch (error) {
            console.error("[Lead Update] Error updating lead bucket:", error);
          }
        }
      }
    }

    // 2. Push job update to ProspectPlus API (for trial count decrement & status update)
    console.log(`[Trial Tracking] Job ${event.params.jobId} reached ${statusAfter} for leadId ${leadId}. Pushing to ProspectPlus API...`);
    try {
      const response = await fetch(`https://prospectplus.com.au/api/localmile/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": prospectplusApiKey.value()
        },
        body: JSON.stringify({
          leadId,
          jobId: event.params.jobId,
          status: statusAfter,
          service: afterData.service || "Outgoing Mail Lodgement",
          completedAt: new Date().toISOString()
        })
      });

      if (!response.ok) {
        console.error("[Trial Tracking] Failed to push job update:", await response.text());
      } else {
        console.log(`[Trial Tracking] Successfully logged job update for leadId ${leadId}`);
      }
    } catch (error) {
      console.error("[Trial Tracking] Error pushing job update:", error);
    }
  }

});

// Logic: onCustomerActive
// Shared activation logic
async function activateRequestsForCustomer(newData: any, oldData: any) {
  if (newData.status === "Active" && oldData.status !== "Active") {
    const netsuiteId = newData.companyId || newData.netsuiteId;
    const companyName = newData.companyName;

    if (!netsuiteId && !companyName) {
      console.log("No ID or name found for customer activation.");
      return;
    }

    const firestore = getDB();
    const requestsRef = firestore.collection("requests");
    const docsToUpdate: admin.firestore.QueryDocumentSnapshot[] = [];

    // 1. Match by NetSuite ID
    if (netsuiteId) {
      const snap = await requestsRef
        .where("netsuiteCustomerId", "==", netsuiteId)
        .where("status", "==", "awaiting-activation")
        .get();
      snap.docs.forEach((d) => docsToUpdate.push(d as admin.firestore.QueryDocumentSnapshot));
    }

    // 2. Match by Company Name
    if (companyName) {
      const snap = await requestsRef
        .where("customer.company", "==", companyName)
        .where("status", "==", "awaiting-activation")
        .get();
      snap.docs.forEach((d) => {
        if (!docsToUpdate.find((existing) => existing.id === d.id)) {
          docsToUpdate.push(d as admin.firestore.QueryDocumentSnapshot);
        }
      });
    }

    // 3. Match by Email (Fallback)
    const email = newData.email || newData.companyEmail;
    if (email) {
      const snap = await requestsRef
        .where("customer.email", "==", email)
        .where("status", "==", "awaiting-activation")
        .get();
      snap.docs.forEach((d) => {
        if (!docsToUpdate.find((existing) => existing.id === d.id)) {
          docsToUpdate.push(d as admin.firestore.QueryDocumentSnapshot);
        }
      });
    }

    if (docsToUpdate.length === 0) {
      console.log(`No queued requests found for customer: ${companyName} (${netsuiteId})`);
      return;
    }

    console.log(`Activating ${docsToUpdate.length} requests for ${companyName}`);
    const batch = firestore.batch();
    docsToUpdate.forEach((doc) => {
      batch.update(doc.ref, {
        status: "pending",
        activatedAt: admin.firestore.FieldValue.serverTimestamp(),
        activationReason: "Customer became Active",
      });
    });

    await batch.commit();
    console.log("Batch activation complete.");
  }
}

// Logic: onCustomerActive (LPO Subcollection)
export const onCustomerActive = onDocumentUpdated({
  document: "lpo/{parentId}/customers/{customerId}",
  database: "(default)",
}, async (event) => {
  const newData = event.data?.after.data();
  const oldData = event.data?.before.data();
  if (!newData || !oldData) return;
  await activateRequestsForCustomer(newData, oldData);
});

// Logic: onIndependentCustomerActive (Top-level Collection)
export const onIndependentCustomerActive = onDocumentUpdated({
  document: "customers/{customerId}",
  database: "(default)",
}, async (event) => {
  const newData = event.data?.after.data();
  const oldData = event.data?.before.data();
  if (!newData || !oldData) return;
  await activateRequestsForCustomer(newData, oldData);
});

async function handleCustomerCancellation(newData: any, oldData: any, customerId: string, parentId?: string, gmailAppPassword?: any) {
  if (newData.status === "cancelled" && oldData.status !== "cancelled") {
    console.log(`[Customer Cancellation] Triggered for ${newData.companyName} (${customerId})`);

    const db = getDB();

    // Get Parent Name
    let parentName = "Independent Customer";
    if (parentId) {
      try {
        const parentDoc = await db.collection("lpo").doc(parentId).get();
        if (parentDoc.exists) {
          parentName = parentDoc.data()?.name || parentName;
        }
      } catch (e) {
        console.error("Error fetching parent name:", e);
      }
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "bookings@localmile.plus",
        pass: gmailAppPassword.value(),
      },
    });

    const customerName = newData.companyName || newData.company_name || "Unknown Customer";
    const netsuiteId = newData.companyId || newData.customerInternalId || newData.netsuiteId || "N/A";
    const reason = newData.cancellationReason || "No reason provided";
    const notes = newData.cancellationNotes || "No notes provided";

    const mailOptions = {
      from: '"LocalMile.Plus Notifications" <bookings@localmile.plus>',
      to: "mailplusit@mailplus.com.au",
      subject: `CUSTOMER CANCELLED: ${customerName} (${parentName})`,
      html: `
        <div style="font-family: sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #dc2626;">Customer Cancellation Notification</h2>
          <p>The following customer has been cancelled in the LocalMile.Plus system.</p>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
                <td style="padding: 8px 0; color: #666; width: 150px;"><strong>Customer:</strong></td>
                <td>${customerName}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; color: #666;"><strong>NetSuite ID:</strong></td>
                <td>${netsuiteId}</td>
            </tr>
            <tr>
                <td style="padding: 8px 0; color: #666;"><strong>${parentId ? 'Parent Account' : 'Hierarchy'}:</strong></td>
                <td>${parentName}</td>
            </tr>
            ${parentId ? `
            <tr>
                <td style="padding: 8px 0; color: #666;"><strong>Parent ID:</strong></td>
                <td>${parentId}</td>
            </tr>` : ''}
          </table>
          
          <div style="margin-top: 20px; padding: 15px; background: #fef2f2; border-radius: 8px;">
            <p><strong>Reason:</strong> ${reason}</p>
            <p><strong>Notes:</strong> ${notes}</p>
          </div>

          <p style="font-size: 12px; color: #999; margin-top: 30px;">
            This is an automated notification from LocalMile.Plus
          </p>
        </div>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`[Email Success] Cancellation email sent for ${customerName}`);

      // Log to communications
      await logCommunication({
        from: "bookings@localmile.plus",
        to: "mailplusit@mailplus.com.au",
        subject: mailOptions.subject,
        body: mailOptions.html,
        type: 'sent',
        metadata: {
          parentId,
          customerId,
          companyName: customerName,
          type: 'cancellation_notification'
        }
      });
    } catch (error) {
      console.error(`[Email Error] Failed to send cancellation email:`, error);
    }
  }
}

// Logic: onCustomerCancelled (LPO Subcollection)
export const onCustomerCancelled = onDocumentUpdated({
  document: "lpo/{parentId}/customers/{customerId}",
  database: "(default)",
  secrets: [gmailAppPassword],
}, async (event) => {
  const newData = event.data?.after.data();
  const oldData = event.data?.before.data();
  const { parentId, customerId } = event.params;
  if (!newData || !oldData) return;
  await handleCustomerCancellation(newData, oldData, customerId, parentId, gmailAppPassword);
});

// Logic: onIndependentCustomerCancelled (Top-level Collection)
export const onIndependentCustomerCancelled = onDocumentUpdated({
  document: "customers/{customerId}",
  database: "(default)",
  secrets: [gmailAppPassword],
}, async (event) => {
  const newData = event.data?.after.data();
  const oldData = event.data?.before.data();
  const { customerId } = event.params;
  if (!newData || !oldData) return;
  await handleCustomerCancellation(newData, oldData, customerId, undefined, gmailAppPassword);
});

// Logic: sendEmailFromNetSuite (NetSuite API)
export const sendEmailFromNetSuite = onRequest({
  secrets: [gmailAppPassword, netsuiteApiKey],
  cors: true, // Allow cross-origin requests from NetSuite
}, async (req, res) => {
  // 1. Security Check
  const providedKey = req.headers['x-api-key'] || req.query.api_key;
  if (!providedKey || providedKey !== netsuiteApiKey.value()) {
    console.warn("Unauthorized attempt to call NetSuite Email API");
    res.status(401).send({ success: false, message: "Unauthorized. Please provide a valid X-API-KEY." });
    return;
  }

  // 2. Parse and Validate Body
  const { to, cc, subject, html, metadata } = req.body;

  if (!to || !subject || !html) {
    res.status(400).send({ success: false, message: "Missing required fields: to, subject, or html." });
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "bookings@localmile.plus",
      pass: gmailAppPassword.value(),
    },
  });

  const taggedHtml = injectMetadataTag(html, metadata);

  const mailOptions = {
    from: '"LocalMile.Plus" <bookings@localmile.plus>',
    to: Array.isArray(to) ? to.join(',') : to,
    cc: cc ? (Array.isArray(cc) ? cc.join(',') : cc) : undefined,
    subject: metadata?.jobId ? `[Ref: ${metadata.jobId}] ${subject}` : subject,
    html: taggedHtml,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("NetSuite Email sent:", info.messageId);

    // Log to communications
    await logCommunication({
      from: "bookings@localmile.plus",
      to: mailOptions.to,
      subject: mailOptions.subject,
      body: taggedHtml,
      type: 'sent',
      metadata: metadata || {}
    });

    res.status(200).send({ success: true, messageId: info.messageId });
  } catch (error: any) {
    console.error("Error sending NetSuite email:", error);
    res.status(500).send({ success: false, message: error.message });
  }
});

// Logic: callNetSuite
export const callNetSuiteProxy = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const { url } = request.data;
  if (!url) {
    throw new HttpsError("invalid-argument", "The function must be called with a 'url' argument.");
  }

  console.log(`Calling NetSuite URL: ${url}`);
  try {
    const response = await fetch(url);
    const text = await response.text();
    try {
      const result = JSON.parse(text.trim());
      return result;
    } catch (e) {
      console.warn("NetSuite Proxy JSON parse warning:", e, "Raw text:", text);
      // If it's not valid JSON but it's not an HTTP error, we can return the text directly
      return { _rawText: text };
    }
  } catch (error) {
    console.error("NetSuite Proxy Error:", error);
    throw new HttpsError("internal", "Failed to communicate with NetSuite API.");
  }
});

// Logic: syncProspectPlusTermsAccepted
export const syncProspectPlusTermsAccepted = onCall({ invoker: "public", secrets: [prospectplusApiKey] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const { customer_id } = request.data;
  if (!customer_id) {
    throw new HttpsError("invalid-argument", "The function must be called with a 'customer_id' argument.");
  }

  const leadId = extractStringId(customer_id);
  if (!leadId) {
    throw new HttpsError("invalid-argument", "Invalid customer_id format.");
  }

  console.log(`[ProspectPlus Sync] Syncing T&C acceptance for leadId: ${leadId}`);

  try {
    const payload = {
      localMileTermsAccepted: true,
      localMileTermsAcceptedAt: new Date().toISOString(),
      customerStatus: "LocalMile Pending"
    };

    const response = await fetch(`https://prospectplus.com.au/api/leads/${leadId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": prospectplusApiKey.value()
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[ProspectPlus Sync] Failed to sync T&C acceptance:", errorText);
      throw new HttpsError("internal", "Failed to sync with ProspectPlus API.");
    }

    console.log(`[ProspectPlus Sync] Successfully synced T&C acceptance for leadId: ${leadId}`);
    return { success: true };
  } catch (error) {
    console.error("[ProspectPlus Sync] Error syncing T&C acceptance:", error);
    throw new HttpsError("internal", "Failed to sync with ProspectPlus API.");
  }
});

// Logic: onChatMessageSent
export const onChatMessageSent = onDocumentUpdated({
  document: "requests/{requestId}",
  database: "(default)",
}, async (event) => {
  const afterData = event.data?.after.data();
  const beforeData = event.data?.before.data();

  if (!afterData || !beforeData) return;

  const afterChat = afterData.chat || [];
  const beforeChat = beforeData.chat || [];

  if (afterChat.length > beforeChat.length) {
    const lastMessage = afterChat[afterChat.length - 1];
    const sender = lastMessage.sender;
    const text = lastMessage.text;
    const requestId = event.params.requestId;
    const refId = requestId.slice(0, 8).toUpperCase();
    const clickAction = `https://localmile.plus/request/${requestId}`;

    const messaging = admin.messaging();
    const db = getDB();

    if (sender === 'user') {
      const parentId = afterData.parent_id;
      if (!parentId) return;

      const usersSnapshot = await db.collection('users')
        .where('parent_id', '==', parentId)
        .get();

      const tokens: string[] = [];
      usersSnapshot.forEach(doc => {
        const userData = doc.data();
        if (userData.fcmTokens && Array.isArray(userData.fcmTokens)) {
          tokens.push(...userData.fcmTokens);
        }
      });

      const uniqueTokens = [...new Set(tokens)].filter(t => !!t);
      console.log(`[Notification] Found ${uniqueTokens.length} unique operator tokens for Parent: ${parentId}`);

      if (uniqueTokens.length > 0) {
        const payload: admin.messaging.MulticastMessage = {
          notification: {
            title: `[Ref: #${refId}] New message from ${afterData.customer.company}`,
            body: text,
          },
          data: {
            title: `[Ref: #${refId}] New message from ${afterData.customer.company}`,
            body: text,
            link: clickAction
          },
          webpush: {
            fcmOptions: {
              link: clickAction
            }
          },
          tokens: uniqueTokens
        };

        const response = await messaging.sendEachForMulticast(payload);
        console.log(`Successfully sent ${response.successCount} operator notifications.`);

        if (response.failureCount > 0) {
          console.error(`Failed to send ${response.failureCount} operator notifications.`);
          response.responses.forEach((resp, idx) => {
            if (!resp.success) {
              console.error(`Token Index ${idx} Error:`, resp.error);
            }
          });
        }
      }
    } else if (sender === 'operator') {
      const tokens = (afterData.customerTokens || []) as string[];
      const uniqueTokens = [...new Set(tokens)].filter(t => !!t);
      console.log(`[Notification] Found ${uniqueTokens.length} customer tokens for Request: ${requestId}`);

      if (uniqueTokens.length > 0) {
        const payload: admin.messaging.MulticastMessage = {
          notification: {
            title: `[Ref: #${refId}] Message from Parent`,
            body: text,
          },
          data: {
            title: `[Ref: #${refId}] Message from Parent`,
            body: text,
            link: clickAction
          },
          webpush: {
            fcmOptions: {
              link: clickAction
            }
          },
          tokens: uniqueTokens
        };

        const response = await messaging.sendEachForMulticast(payload);
        console.log(`Successfully sent ${response.successCount} customer notifications.`);

        if (response.failureCount > 0) {
          console.error(`Failed to send ${response.failureCount} customer notifications.`);
          response.responses.forEach((resp, idx) => {
            if (!resp.success) {
              console.error(`Token Index ${idx} Error:`, resp.error);
            }
          });
        }
      }
    }
  }
});

// Logic: updateJobStatus
export const updateJobStatus = onRequest({
  cors: true,
}, async (req, res) => {
  // Validate method
  if (req.method !== 'POST') {
    res.status(405).send({ success: false, message: "Method Not Allowed" });
    return;
  }

  // Validate Authorization header
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).send({ success: false, message: "Unauthorized. Missing or invalid Authorization header." });
    return;
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    await admin.auth().verifyIdToken(token);
  } catch (error: any) {
    console.error("Token verification failed:", error);
    res.status(401).send({ success: false, message: "Unauthorized. Invalid token." });
    return;
  }

  // Support both wrapped "data" field (Firebase Callable standard) and direct body
  const payload = req.body.data || req.body;
  const { jobId, collectionName, status, stops } = payload;

  if (!jobId || !collectionName) {
    res.status(400).send({ success: false, message: "jobId and collectionName are required." });
    return;
  }

  if (!['jobs', 'requests'].includes(collectionName)) {
    res.status(400).send({ success: false, message: "collectionName must be either 'jobs' or 'requests'." });
    return;
  }

  const db = getDB();
  const docRef = db.collection(collectionName).doc(jobId);
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    res.status(404).send({ success: false, message: "Job not found." });
    return;
  }

  const jobData = docSnap.data();
  if (!jobData) {
    res.status(500).send({ success: false, message: "Job data is empty." });
    return;
  }

  const updatedData: any = {
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  let currentStops = [...(jobData.stops || [])];
  let stopsUpdated = false;

  if (stops && Array.isArray(stops)) {
    stops.forEach((stopUpdate: { index: number, status: string }) => {
      const { index, status: stopStatus } = stopUpdate;
      if (currentStops[index]) {
        currentStops[index] = { ...currentStops[index], status: stopStatus };
        stopsUpdated = true;
      }
    });
    updatedData.stops = currentStops;
  }

  if (status) {
    updatedData.status = status;
  } else if (stopsUpdated) {
    const allCompleted = currentStops.every((s: any) => s.status === 'completed');
    const anyCompleted = currentStops.some((s: any) => s.status === 'completed');

    if (allCompleted) {
      updatedData.status = 'completed';
    } else if (anyCompleted) {
      updatedData.status = 'in-progress';
    }
  }

  await docRef.update(updatedData);

  res.status(200).send({
    success: true,
    jobId,
    status: updatedData.status || jobData.status,
    stopsUpdated
  });
});

// Logic: generateDailyScheduledJobs
export const generateDailyScheduledJobs = onSchedule({
  schedule: "5 5 * * *", // 5:05 AM every day
  timeZone: "Australia/Sydney", // Adjust to LPO timezone
}, async (event) => {
  const db = getDB();

  // Use Australia/Sydney timezone for date calculations
  const sydneyTimeFormatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short'
  });

  // parts will look like: [ { type: 'weekday', value: 'Wed' }, ... ]
  const parts = sydneyTimeFormatter.formatToParts(new Date());

  // Log parts as a string to see the internal structure in logs
  console.log("Time parts:", JSON.stringify(parts));

  let year = '';
  let month = '';
  let day = '';
  let todayDayName = '';

  for (const part of parts) {
    if (part.type === 'year') year = part.value;
    if (part.type === 'month') month = part.value;
    if (part.type === 'day') day = part.value;
    if (part.type === 'weekday') todayDayName = part.value;
  }

  // Sometimes 'short' weekday returns "Wed." or "Wed", we just need the first 3 chars
  todayDayName = todayDayName.substring(0, 3);

  const todayStr = `${year}-${month}-${day}`;

  // Log the final calculated date and day name
  console.log(`Target Date: ${todayStr}, Day Name: ${todayDayName}`);

  const scheduledJobsRef = db.collection('scheduled_jobs');
  const jobsRef = db.collection('jobs');

  const snapshot = await scheduledJobsRef.where('status', 'in', ['accepted', 'scheduled']).get();
  let generatedCount = 0;

  const batch = db.batch();
  let operationsInBatch = 0;

  for (const doc of snapshot.docs) {
    const template = doc.data();

    // Check if job is stopped or skipped today
    if (template.recurrenceStatus === 'stopped') continue;
    if (template.skippedDates && template.skippedDates.includes(todayStr)) continue;

    // Check if the template has started
    if (template.date > todayStr) continue;

    // Check if today matches the frequency
    if (template.frequency && Array.isArray(template.frequency) && template.frequency.includes(todayDayName)) {

      // Avoid duplicate generation for this exact template + date
      const existingInstances = await jobsRef
        .where('scheduledJobId', '==', doc.id)
        .where('date', '==', todayStr)
        .get();

      if (existingInstances.empty) {
        // Create new instance
        const newJobRef = jobsRef.doc();
        batch.set(newJobRef, {
          ...template, // Copies all fields including stops
          jobType: 'scheduled_instance',
          scheduledJobId: doc.id,
          date: todayStr,
          status: 'scheduled',
          syncedWithNetSuite: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          operatorNetSuiteId: null,
          operatorName: null,
          operatorEmail: null,
          operatorPhone: null
        });

        generatedCount++;
        operationsInBatch++;

        // Firestore batch limit is 500
        if (operationsInBatch >= 450) {
          await batch.commit();
          operationsInBatch = 0;
        }
      }
    }
  }

  if (operationsInBatch > 0) {
    await batch.commit();
  }

  console.log(`Generated ${generatedCount} daily scheduled jobs for ${todayStr}`);
});

// Logic: sendSupportEmail
export const sendSupportEmail = onCall({
  secrets: [gmailAppPassword],
}, async (request) => {
  console.log("[Support Email] Function triggered");

  if (!request.auth) {
    console.warn("[Support Email] Unauthenticated request");
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const { message, subject, jobId, metadata } = request.data;
  console.log(`[Support Email] Data: jobId=${jobId}, subject=${subject}`);

  if (!message) {
    console.warn("[Support Email] Missing message");
    throw new HttpsError("invalid-argument", "Message is required.");
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "bookings@localmile.plus",
        pass: gmailAppPassword.value(),
      },
    });

    const recipients = ["michael.mcdaid@mailplus.com.au", "kerry.oneill@mailplus.com.au", "dispatcher@mailplus.com.au"];

    // Build metadata section
    let metadataHtml = "";
    if (metadata) {
      metadataHtml = `
        <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #e9ecef;">
          <h4 style="margin-top: 0; color: #1A3D33;">Inquiry Metadata</h4>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            ${metadata.lpoName ? `<tr><td style="padding: 4px 0; color: #666; width: 150px;"><strong>Parent Name:</strong></td><td style="padding: 4px 0;">${metadata.lpoName}</td></tr>` : ""}
            ${metadata.companyName ? `<tr><td style="padding: 4px 0; color: #666;"><strong>Company:</strong></td><td style="padding: 4px 0;">${metadata.companyName}</td></tr>` : ""}
            ${metadata.contactName ? `<tr><td style="padding: 4px 0; color: #666;"><strong>Contact:</strong></td><td style="padding: 4px 0;">${metadata.contactName}</td></tr>` : ""}
            ${metadata.contactEmail ? `<tr><td style="padding: 4px 0; color: #666;"><strong>Contact Email:</strong></td><td style="padding: 4px 0;">${metadata.contactEmail}</td></tr>` : ""}
            ${metadata.contactPhone ? `<tr><td style="padding: 4px 0; color: #666;"><strong>Contact Phone:</strong></td><td style="padding: 4px 0;">${metadata.contactPhone}</td></tr>` : ""}
            ${metadata.serviceType ? `<tr><td style="padding: 4px 0; color: #666;"><strong>Service Type:</strong></td><td style="padding: 4px 0;">${metadata.serviceType}</td></tr>` : ""}
            ${metadata.billing ? `<tr><td style="padding: 4px 0; color: #666;"><strong>Billing:</strong></td><td style="padding: 4px 0;">${metadata.billing}</td></tr>` : ""}
            ${jobId ? `<tr><td style="padding: 4px 0; color: #666;"><strong>Job Reference:</strong></td><td style="padding: 4px 0;">${jobId}</td></tr>` : ""}
          </table>
        </div>
      `;
    }

    const mailOptions = {
      from: '"LocalMile.Plus Support" <bookings@localmile.plus>',
      to: recipients.join(","),
      replyTo: "bookings@localmile.plus",
      subject: subject || `Inquiry from LocalMile.Plus User${jobId ? ` (Job Ref: ${jobId})` : ""}`,
      html: `
        <div style="font-family: sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1A3D33;">New Support Inquiry</h2>
          <p><strong>User Email:</strong> ${request.auth.token.email || "Unknown User"}</p>
          
          ${metadataHtml}

          <p><strong>User Message:</strong></p>
          <div style="background: #fdfef0; padding: 20px; border-radius: 8px; border-left: 4px solid #EAF044; font-style: italic;">
            ${message.replace(/\n/g, '<br>')}
          </div>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="font-size: 12px; color: #999;">This email was sent via LocalMile.Plus Support System.</p>
        </div>
      `,
    };

    console.log("[Support Email] Sending via Nodemailer...");
    const info = await transporter.sendMail(mailOptions);
    console.log("Support Email sent:", info.messageId);

    // Log to communications
    await logCommunication({
      from: "bookings@localmile.plus",
      to: recipients.join(","),
      subject: mailOptions.subject,
      body: mailOptions.html,
      type: 'sent',
      metadata: {
        ...metadata,
        jobId,
        type: 'support_inquiry'
      }
    });

    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error("Error sending support email:", error);
    throw new HttpsError("internal", error.message);
  }
});

// Logic: cancelJob
export const cancelJob = onCall({
  secrets: [gmailAppPassword],
}, async (request) => {
  console.log("[Cancel Job] Function triggered");

  if (!request.auth) {
    console.warn("[Cancel Job] Unauthenticated request");
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const { jobId, reason, notes, metadata } = request.data;
  console.log(`[Cancel Job] Data: jobId=${jobId}, reason=${reason}`);

  if (!jobId || !reason) {
    console.warn("[Cancel Job] Missing required fields");
    throw new HttpsError("invalid-argument", "jobId and reason are required.");
  }

  const db = getDB();

  try {
    // 1. Update Firestore
    const jobRef = db.collection('jobs').doc(jobId);
    const jobSnap = await jobRef.get();

    if (!jobSnap.exists) {
      // Check scheduled_jobs if not in jobs
      const schedRef = db.collection('scheduled_jobs').doc(jobId);
      const schedSnap = await schedRef.get();

      if (!schedSnap.exists) {
        throw new HttpsError("not-found", "Job not found in active jobs or schedules.");
      }

      await schedRef.update({
        status: 'cancelled',
        cancellationReason: reason,
        cancellationNotes: notes || "",
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        cancelledBy: request.auth.token.email
      });
    } else {
      await jobRef.update({
        status: 'cancelled',
        cancellationReason: reason,
        cancellationNotes: notes || "",
        cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        cancelledBy: request.auth.token.email
      });
    }

    // 2. Send Email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "bookings@localmile.plus",
        pass: gmailAppPassword.value(),
      },
    });

    const recipient = "dispatcher@mailplus.com.au";
    const userEmail = request.auth.token.email || "Unknown User";

    const mailOptions = {
      from: '"LocalMile.Plus Bookings" <bookings@localmile.plus>',
      to: recipient,
      replyTo: "bookings@localmile.plus",
      subject: `JOB CANCELLATION: [Ref: ${jobId}] ${metadata?.companyName || 'Job'}`,
      html: `
        <div style="font-family: 'Fraunces', serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 12px; overflow: hidden;">
          <div style="background: #ff4757; color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">Job Cancellation Notice</h1>
          </div>
          <div style="padding: 30px;">
            <p>A job has been cancelled in the LocalMile.Plus portal.</p>
            
            <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; color: #666; width: 140px;"><strong>Job Reference:</strong></td><td style="padding: 8px 0;">#${jobId}</td></tr>
                ${metadata?.companyName ? `<tr><td style="padding: 8px 0; color: #666;"><strong>Customer:</strong></td><td style="padding: 8px 0;">${metadata.companyName}</td></tr>` : ""}
                ${metadata?.serviceType ? `<tr><td style="padding: 8px 0; color: #666;"><strong>Service:</strong></td><td style="padding: 8px 0;">${metadata.serviceType}</td></tr>` : ""}
                ${metadata?.date ? `<tr><td style="padding: 8px 0; color: #666;"><strong>Date:</strong></td><td style="padding: 8px 0;">${metadata.date}</td></tr>` : ""}
                <tr><td style="padding: 8px 0; color: #666;"><strong>Cancelled By:</strong></td><td style="padding: 8px 0;">${userEmail}</td></tr>
              </table>
            </div>

            <div style="margin-top: 30px;">
              <h3 style="color: #ff4757; border-bottom: 2px solid #ff4757; padding-bottom: 8px; display: inline-block;">Cancellation Details</h3>
              <p><strong>Reason:</strong> ${reason}</p>
              ${notes ? `<p><strong>Notes:</strong></p><div style="background: #fffafa; padding: 15px; border-left: 4px solid #ff4757; font-style: italic;">${notes.replace(/\n/g, '<br>')}</div>` : ""}
            </div>

            <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="font-size: 14px; color: #666; text-align: center;">This is an automated notification from the LocalMile.Plus portal.</p>
          </div>
        </div>
      `,
    };

    const taggedHtml = injectMetadataTag(mailOptions.html, {
      ...metadata,
      jobId,
      parentId: metadata?.parentId,
      customerId: metadata?.customerId
    });

    await transporter.sendMail({
      ...mailOptions,
      html: taggedHtml
    });

    // 3. Log to communications
    await logCommunication({
      from: "bookings@localmile.plus",
      to: recipient,
      subject: mailOptions.subject,
      body: taggedHtml,
      type: 'sent',
      metadata: {
        ...metadata,
        jobId,
        reason,
        type: 'cancellation'
      }
    });

    return { success: true };
  } catch (error: any) {
    console.error("Error in cancelJob:", error);
    throw new HttpsError("internal", error.message);
  }
});

// Admin User Management Logic
const SUPER_ADMIN_ID = "lwOQ8j5MSIdOiyR0VZ1zEvfpx7A3";

/**
 * Validates if the calling user is a superadmin.
 */
const validateSuperAdmin = async (auth: any) => {
  if (!auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  if (auth.uid === SUPER_ADMIN_ID) return true;

  const db = getDB();
  const userDoc = await db.collection("users").doc(auth.uid).get();
  const userData = userDoc.data();

  if (userData?.role !== "superadmin") {
    throw new HttpsError("permission-denied", "Only superadmins can perform this action.");
  }

  return true;
};

// Logic: adminCreateUser
export const adminCreateUser = onCall({
  secrets: [gmailAppPassword],
}, async (request) => {
  await validateSuperAdmin(request.auth);

  const { email, password, role, parent_id } = request.data;

  if (!email || !password || !role) {
    throw new HttpsError("invalid-argument", "Missing required fields (email, password, role).");
  }

  try {
    console.log(`[Admin] Creating user: ${email} with role: ${role}`);

    // 1. Create user in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: email.split('@')[0],
    });

    // 2. Create record in Firestore
    const db = getDB();
    await db.collection("users").doc(userRecord.uid).set({
      uid: userRecord.uid,
      email: email.toLowerCase(),
      role: role,
      parent_id: (role === 'admin' || role === 'superadmin') ? '' : parent_id,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      hasCompletedTour: false
    });

    // 3. Send Invitation Email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "bookings@localmile.plus",
        pass: gmailAppPassword.value(),
      },
    });

    const signInLink = "https://localmile.plus/signin";
    const mailOptions = {
      from: '"LocalMile.Plus" <bookings@localmile.plus>',
      to: email,
      subject: "Welcome to LocalMile.Plus - Your Account is Ready",
      html: `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
          <div style="background-color: #1a3d33; padding: 40px; text-align: center; border-top-left-radius: 12px; border-top-right-radius: 12px;">
            <h1 style="color: #ffffff; margin: 0; font-weight: 300; letter-spacing: 2px;">LocalMile<span style="color: #EAF044; font-weight: bold;">.Plus</span></h1>
          </div>
          <div style="padding: 40px; background: #ffffff; border: 1px solid #f0f0f0; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px;">
            <h2 style="color: #1a3d33; margin-top: 0;">Welcome aboard!</h2>
            <p>Your account for the LocalMile.Plus portal has been created. You can now sign in to manage your logistics operations.</p>
            
            <div style="margin: 30px 0; text-align: center;">
              <a href="${signInLink}" style="background-color: #1a3d33; color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">SIGN IN TO PORTAL</a>
            </div>

            <p style="font-size: 14px; color: #666;"><strong>Note:</strong> If you would like to set your own secure password, simply click <strong>"Forgot Password"</strong> on the sign-in page and follow the instructions.</p>
            
            <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="font-size: 12px; color: #999; text-align: center;">
              &copy; ${new Date().getFullYear()} LocalMile.Plus. All rights reserved.
            </p>
          </div>
        </div>
      `,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`[Admin] Invitation email sent to ${email}`);
    } catch (emailError) {
      console.error("[Admin] Failed to send invitation email:", emailError);
      // We don't throw here because the user is already created
    }

    return { success: true, uid: userRecord.uid };
  } catch (error: any) {
    console.error("[Admin Create User Error]:", error);
    throw new HttpsError("internal", error.message || "Failed to create user.");
  }
});

export const adminUpdateUser = onCall(async (request) => {
  await validateSuperAdmin(request.auth);

  const { uid, email } = request.data;

  if (!uid || !email) {
    throw new HttpsError("invalid-argument", "Missing required fields (uid, email).");
  }

  try {
    console.log(`[Admin] Updating user: ${uid} with new email: ${email}`);

    // 1. Update in Firebase Auth
    await admin.auth().updateUser(uid, {
      email: email,
    });

    // 2. Update in Firestore
    const db = getDB();
    await db.collection("users").doc(uid).update({
      email: email.toLowerCase(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
  } catch (error: any) {
    console.error("[Admin Update User Error]:", error);
    throw new HttpsError("internal", error.message || "Failed to update user.");
  }
});


// Logic: adminResetPassword
export const adminResetPassword = onCall(async (request) => {
  await validateSuperAdmin(request.auth);

  const { uid, newPassword } = request.data;

  if (!uid || !newPassword) {
    throw new HttpsError("invalid-argument", "Missing UID or new password.");
  }

  try {
    console.log(`[Admin] Resetting password for user UID: ${uid}`);

    await admin.auth().updateUser(uid, {
      password: newPassword
    });

    return { success: true };
  } catch (error: any) {
    console.error("[Admin Reset Password Error]:", error);
    throw new HttpsError("internal", error.message || "Failed to reset password.");
  }
});

// Logic: requestPasswordReset
export const requestPasswordReset = onCall({
  secrets: [gmailAppPassword],
}, async (request) => {
  const { email } = request.data;

  if (!email) {
    throw new HttpsError("invalid-argument", "The function must be called with an email address.");
  }

  try {
    // 1. Generate the reset link
    const actionCodeSettings = {
      // Use the origin if provided, otherwise fallback to production URL
      url: request.data.origin ? `${request.data.origin}/signin` : 'https://localmile-plus.web.app/signin',
      handleCodeInApp: true,
    };

    console.log(`[Auth] Generating password reset link for: ${email}`);
    const link = await admin.auth().generatePasswordResetLink(email, actionCodeSettings);

    // 2. Prepare the custom email
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "bookings@localmile.plus",
        pass: gmailAppPassword.value(),
      },
    });

    const mailOptions = {
      from: '"LocalMile.Plus" <bookings@localmile.plus>',
      to: email,
      subject: "Reset your LocalMile.Plus password",
      html: `
        <div style="font-family: 'Fraunces', serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #333;">
          <!-- Header -->
          <div style="background-color: #095c7b; padding: 40px 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 32px; letter-spacing: 2px;">
              <span style="color: #ffffff;">LocalMile</span><span style="color: #EAF044;">.Plus</span>
            </h1>
          </div>

          <!-- Body -->
          <div style="padding: 40px 30px; text-align: center;">
            <h2 style="color: #a5d6a7; font-size: 24px; margin-bottom: 20px;">Password Reset Request</h2>
            <p style="color: #cccccc; font-size: 16px; line-height: 1.6; margin-bottom: 30px;">
              We received a request to reset the password for your LocalMile.Plus account. Click the button below to choose a new password.
            </p>
            
            <div style="margin: 40px 0;">
              <a href="${link}" style="background-color: #095c7b; color: #EAF044; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block; border: 1px solid #EAF044;">
                RESET MY PASSWORD
              </a>
            </div>

            <div style="margin-top: 40px; color: #888888; font-size: 15px; line-height: 1.6;">
              <p>If you didn't request this, you can safely ignore this email. Your password will not change until you access the link above and create a new one.</p>
              <p style="margin-top: 20px; font-size: 14px; color: #666666;">This link will expire in 1 hour.</p>
            </div>
          </div>

          <!-- Footer -->
          <div style="background-color: #1c1c1e; padding: 30px 20px; text-align: center; border-top: 1px solid #333;">
            <p style="margin: 0; color: #999999; font-size: 14px; font-weight: bold;">
              LocalMile.Plus | Premium Logistics Solutions
            </p>
            <p style="margin: 5px 0 20px 0; color: #666666; font-size: 13px;">
              Powered by MailPlus Australia
            </p>
            <p style="margin: 0; color: #444444; font-size: 12px;">
              © 2026 LocalMile.Plus. All rights reserved.
            </p>
          </div>
        </div>
      `,
    };

    // 3. Send the email
    await transporter.sendMail(mailOptions);
    console.log(`[Auth] Custom password reset email sent to: ${email}`);

    return { success: true };
  } catch (error: any) {
    console.error("[Request Password Reset Error]:", error);
    // For security, don't reveal if user-not-found, but log it
    if (error.code === 'auth/user-not-found') {
      return { success: true };
    }
    throw new HttpsError("internal", error.message || "Failed to generate password reset link.");
  }
});

const processIncomingEmails = async () => {
  try {
    console.log("[IMAP Polling] Checking for new emails...");
    const config = {
      imap: {
        user: 'bookings@localmile.plus',
        password: gmailAppPassword.value(),
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        authTimeout: 5000,
        tlsOptions: { rejectUnauthorized: false }
      }
    };

    const connection: ImapSimple = await connect(config);
    await connection.openBox('INBOX');

    // Search for unread messages
    const searchCriteria = ['UNSEEN'];
    const fetchOptions = {
      bodies: ['HEADER', 'TEXT', ''],
      markSeen: true
    };

    const messages = await connection.search(searchCriteria, fetchOptions);
    console.log(`[IMAP Polling] Found ${messages.length} unread messages.`);

    for (const msg of messages) {
      const all = msg.parts.find(part => part.which === '');
      const id = msg.attributes.uid;

      if (all) {
        const parsed = await simpleParser(all.body);
        const html = parsed.html || parsed.textAsHtml || parsed.text || "";

        // Extract Metadata from hidden tag if it exists
        const metadataMatch = html.match(/<!-- LPO_CONNECT_METADATA: (.*?) -->/);
        let metadata = {};
        if (metadataMatch) {
          try {
            metadata = JSON.parse(metadataMatch[1]);
          } catch (e) {
            console.error("Failed to parse metadata", e);
          }
        }

        // Log to Communications
        await logCommunication({
          from: parsed.from?.text || "Unknown",
          to: 'bookings@localmile.plus',
          subject: parsed.subject || "No Subject",
          body: html,
          type: 'received',
          metadata: metadata,
          threadId: parsed.messageId || `imap_${id}`
        });

        console.log(`[IMAP Polling] Ingested email: ${parsed.subject}`);
      }
    }

    connection.end();
  } catch (error) {
    console.error("[IMAP Polling Error]:", error);
  }
};

// Logic: pollGmailInbox (Scheduled every 2 minutes to stay within limits)
export const pollGmailInbox = onSchedule({
  schedule: "*/2 * * * *", // Every 2 minutes
  timeZone: "Australia/Sydney",
  secrets: [gmailAppPassword],
}, async (event) => {
  await processIncomingEmails();
});

// Logic: ingestGmailEmail (Legacy/Fallback for Push)
export const ingestGmailEmail = onRequest({
  secrets: [gmailAppPassword],
  cors: true,
}, async (req, res) => {
  await processIncomingEmails();
  res.status(200).send("OK");
});

// Logic: syncRecentEmails (Manual trigger to pull last 50 messages)
export const syncRecentEmails = onCall({
  secrets: [gmailAppPassword],
}, async (request) => {
  await validateSuperAdmin(request.auth);

  try {
    const config = {
      imap: {
        user: 'bookings@localmile.plus',
        password: gmailAppPassword.value(),
        host: 'imap.gmail.com',
        port: 993,
        tls: true,
        authTimeout: 10000,
        tlsOptions: { rejectUnauthorized: false }
      }
    };

    const connection: ImapSimple = await connect(config);

    // 1. Sync Inbox
    await connection.openBox('INBOX');
    const inboxMessages = await connection.search(['ALL'], { bodies: ['HEADER', 'TEXT', ''], struct: true });
    const recentInbox = inboxMessages.slice(-50);

    for (const msg of recentInbox) {
      const all = msg.parts.find(part => part.which === '');
      if (all) {
        const parsed = await simpleParser(all.body);
        const html = parsed.html || parsed.textAsHtml || parsed.text || "";
        const metadataMatch = html.match(/<!-- LPO_CONNECT_METADATA: (.*?) -->/);
        let metadata = {};
        if (metadataMatch) { try { metadata = JSON.parse(metadataMatch[1]); } catch (e) { } }

        await logCommunication({
          from: parsed.from?.text || "Unknown",
          to: 'bookings@localmile.plus',
          subject: parsed.subject || "No Subject",
          body: html,
          type: 'received',
          metadata: metadata,
          threadId: parsed.messageId || `imap_in_${msg.attributes.uid}`,
          timestamp: parsed.date || new Date()
        });
      }
    }

    // 2. Sync Sent Mail
    try {
      await connection.openBox('[Gmail]/Sent Mail');
      const sentMessages = await connection.search(['ALL'], { bodies: ['HEADER', 'TEXT', ''], struct: true });
      const recentSent = sentMessages.slice(-50);

      for (const msg of recentSent) {
        const all = msg.parts.find(part => part.which === '');
        if (all) {
          const parsed = await simpleParser(all.body);
          const html = parsed.html || parsed.textAsHtml || parsed.text || "";
          const metadataMatch = html.match(/<!-- LPO_CONNECT_METADATA: (.*?) -->/);
          let metadata = {};
          if (metadataMatch) { try { metadata = JSON.parse(metadataMatch[1]); } catch (e) { } }

          await logCommunication({
            from: 'bookings@localmile.plus',
            to: Array.isArray(parsed.to) ? parsed.to.map(t => t.text).join(', ') : (parsed.to?.text || "Unknown"),
            subject: parsed.subject || "No Subject",
            body: html,
            type: 'sent',
            metadata: metadata,
            threadId: parsed.messageId || `imap_sent_${msg.attributes.uid}`,
            timestamp: parsed.date || new Date()
          });
        }
      }
    } catch (e) {
      console.warn("Could not access Sent Mail folder (might be named differently)", e);
    }

    connection.end();
    return { success: true };
  } catch (error: any) {
    console.error("[Manual Sync Error]:", error);
    throw new HttpsError("internal", error.message);
  }
});

// Logic: respondToCommunication (Reply/Forward from Dashboard)
export const respondToCommunication = onCall({
  secrets: [gmailAppPassword],
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");

  const { to, subject, body, metadata, threadId } = request.data;
  if (!to || !subject || !body) {
    throw new HttpsError("invalid-argument", "Missing required fields (to, subject, body).");
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'bookings@localmile.plus',
      pass: gmailAppPassword.value(),
    },
  });

  // Inject metadata for future tracking if it exists
  let enrichedBody = body;
  if (metadata) {
    enrichedBody += `\n\n<!-- LPO_CONNECT_METADATA: ${JSON.stringify(metadata)} -->`;
  }

  const mailOptions = {
    from: '"LocalMile.Plus Support" <bookings@localmile.plus>',
    to,
    subject,
    html: enrichedBody,
    headers: {
      'In-Reply-To': threadId,
      'References': threadId
    }
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[Dashboard Response] Email sent: ${info.messageId}`);

    // Log the sent email
    await logCommunication({
      from: 'bookings@localmile.plus',
      to,
      subject,
      body: enrichedBody,
      type: 'sent',
      metadata: metadata || {},
      threadId: threadId || info.messageId
    });

    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error("[Dashboard Response Error]:", error);
    throw new HttpsError("internal", error.message);
  }
});

// Logic: summarizeCommunication (AI Summarization)
export const summarizeCommunication = onCall({
  secrets: [geminiApiKey],
}, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Auth required.");

  const { communicationId, text } = request.data;
  if (!text) throw new HttpsError("invalid-argument", "Text required.");

  console.log(`[AI Summary] Summarizing communication: ${communicationId}`);

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey.value()}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `Please provide a concise, professional summary of the following logistics email. Highlight the Job ID, Customer Name, and any urgent action items: \n\n ${text}` }]
        }]
      })
    });

    const result = await response.json() as any;
    const summary = result.candidates?.[0]?.content?.parts?.[0]?.text || "Failed to generate summary.";

    if (communicationId) {
      const db = getDB();
      await db.collection("communications").doc(communicationId).update({ aiSummary: summary });
    }

    return { summary };
  } catch (error: any) {
    console.error("[AI Summary Error]:", error);
    throw new HttpsError("internal", "Failed to generate summary.");
  }
});

// Logic: setupGmailWatch (Utility - Now disabled as we use Polling)
export const setupGmailWatch = onCall(async (request) => {
  return { success: true, message: "Polling is active. No manual watch setup required." };
});

/**
 * HELPER: Fetch Daily Job Data for Reports
 */
async function fetchDailyJobReportData(statuses: string[]) {
  const db = getDB();
  const sydneyTimeFormatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = sydneyTimeFormatter.formatToParts(new Date());
  let year = '', month = '', day = '';
  for (const part of parts) {
    if (part.type === 'year') year = part.value;
    if (part.type === 'month') month = part.value;
    if (part.type === 'day') day = part.value;
  }
  const todayStr = `${year}-${month}-${day}`;

  console.log(`[Daily Report] Fetching jobs for ${todayStr} with statuses: ${statuses.join(', ')}`);

  const jobsSnapshot = await db.collection('jobs')
    .where('date', '==', todayStr)
    .where('status', 'in', statuses)
    .get();

  const allDocs: any[] = [...jobsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, docSource: 'jobs' }))];

  // Also fetch from requests if pending is in statuses
  if (statuses.includes('pending')) {
    const requestsSnapshot = await db.collection('requests')
      .where('date', '==', todayStr)
      .where('status', '==', 'pending')
      .get();
    allDocs.push(...requestsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, docSource: 'requests' })));
  }

  const jobsData: any[] = [];
  const lpoCache: { [key: string]: string } = {};
  const customerCache: { [key: string]: any } = {};

  for (const data of allDocs) {
    let lpoName = data.lpo_name;

    if (!lpoName && data.parent_id) {
      if (lpoCache[data.parent_id]) {
        lpoName = lpoCache[data.parent_id];
      } else {
        const lpoDoc = await db.collection('lpo').doc(data.parent_id).get();
        lpoName = lpoDoc.data()?.name || "Unknown Parent";
        lpoCache[data.parent_id] = lpoName;
      }
    }

    let franchisee = data.customer?.franchiseeText;
    if (!franchisee || franchisee === "N/A") {
      const parentId = data.parent_id;
      const cid = data.netsuiteCustomerId || data.customer?.netsuiteId || data.customerId;

      if (parentId && cid) {
        const cacheKey = `${parentId}_${cid}`;
        if (customerCache[cacheKey]) {
          franchisee = customerCache[cacheKey].franchiseeText;
        } else {
          try {
            const cidStr = cid.toString();
            const cidNum = parseInt(cidStr);
            const custQuery = db.collection("lpo").doc(parentId).collection("customers");

            let custSnap = await custQuery.where("companyId", "in", [cidStr, cidNum]).limit(1).get();
            if (custSnap.empty) {
              custSnap = await custQuery.where("customerInternalId", "in", [cidStr, cidNum]).limit(1).get();
            }

            if (!custSnap.empty) {
              const custData = custSnap.docs[0].data();
              franchisee = custData.franchiseeText;
              customerCache[cacheKey] = custData;
            }
          } catch (e) {
            console.error(`[Daily Report] Error fetching customer ${cid} for LPO ${parentId}:`, e);
          }
        }
      }
    }

    jobsData.push({
      id: data.id,
      lpoName: lpoName || "N/A",
      customerName: data.customer?.company || data.customer?.companyName || "Unknown Customer",
      franchisee: franchisee || "N/A",
      status: data.status,
      service: data.service,
      parentId: data.parent_id
    });
  }

  // Sort by LPO Name then Customer Name
  jobsData.sort((a, b) => {
    if (a.lpoName !== b.lpoName) return a.lpoName.localeCompare(b.lpoName);
    return a.customerName.localeCompare(b.customerName);
  });

  return { todayStr, jobs: jobsData };
}

/**
 * DAILY REPORT: 12:15 PM Sydney Time (Weekdays)
 * Shows all jobs still in "Scheduled" status.
 */
export const sendScheduledJobsReport = onSchedule({
  schedule: "15 12 * * 1-5",
  timeZone: "Australia/Sydney",
  secrets: [gmailAppPassword],
}, async (event) => {
  const { todayStr, jobs } = await fetchDailyJobReportData(['scheduled', 'pending']);

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "bookings@localmile.plus",
      pass: gmailAppPassword.value(),
    },
  });

  const reportDate = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const recipient = "dispatcher@mailplus.com.au";

  let jobRows = "";
  jobs.forEach(job => {
    jobRows += `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">${job.lpoName}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee;"><strong>${job.customerName}</strong></td>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">${job.franchisee}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; font-family: monospace; color: #666;">#${job.id.substring(0, 8).toUpperCase()}</td>
      </tr>
    `;
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        .container { font-family: 'Fraunces', serif; max-width: 700px; margin: 0 auto; color: #333; }
        .header { background-color: #095c7b; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 24px; font-weight: 300; }
        .header span { color: #EAF044; font-weight: bold; }
        .alert-bar { background-color: #fffbeb; border-left: 4px solid #EAF044; padding: 20px; margin: 20px 0; }
        .stats { display: flex; gap: 20px; margin-bottom: 30px; }
        .stat-box { background: #f8f9fa; padding: 15px; border-radius: 8px; flex: 1; text-align: center; border: 1px solid #eee; }
        .stat-value { font-size: 24px; font-weight: bold; color: #095c7b; }
        .stat-label { font-size: 12px; color: #666; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; }
        th { text-align: left; background: #f4f7f8; padding: 12px; color: #095c7b; font-weight: bold; }
        .footer { padding: 30px; text-align: center; font-size: 12px; color: #999; background: #f4f7f8; border-radius: 0 0 12px 12px; margin-top: 30px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>LocalMile<span>.Plus</span> | Daily Manifest Alert</h1>
        </div>
        <div class="alert-bar">
          <p style="margin: 0; color: #854d0e;"><strong>Action Required:</strong> The following jobs are still in <strong>Pending</strong> or <strong>Scheduled</strong> status for today. This means they have not yet been accepted by an operator or confirmed.</p>
        </div>
        <div class="stats">
          <div class="stat-box">
            <div class="stat-value">${jobs.length}</div>
            <div class="stat-label">Pending Acceptance</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${reportDate}</div>
            <div class="stat-label">Report Date</div>
          </div>
        </div>
        ${jobs.length > 0 ? `
          <table>
            <thead>
              <tr>
                <th>Parent</th>
                <th>Customer</th>
                <th>Franchisee</th>
                <th>Job Reference</th>
              </tr>
            </thead>
            <tbody>
              ${jobRows}
            </tbody>
          </table>
        ` : `<p style="text-align: center; padding: 40px; background: #fdfdfd; border: 1px dashed #ccc; border-radius: 8px;">All jobs for today have been accepted.</p>`}
        <div style="text-align: center; margin-top: 30px;">
          <a href="https://localmile.plus/dashboard" style="background: #095c7b; color: white; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold;">VIEW JOB MANAGER</a>
        </div>
        <div class="footer">
          <p>This is an automated system notification from LocalMile.Plus</p>
          <p>&copy; ${new Date().getFullYear()} LocalMile.Plus | Premium Logistics Solutions</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const metadata = {
    type: 'daily_report_scheduled',
    date: todayStr,
    jobCount: jobs.length
  };

  const taggedHtml = injectMetadataTag(html, metadata);

  const mailOptions = {
    from: '"LocalMile.Plus Manifest" <bookings@localmile.plus>',
    to: recipient,
    subject: `[Action Required] Daily Manifest: Scheduled Jobs (${todayStr})`,
    html: taggedHtml,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[Daily Report] Scheduled jobs report sent to ${recipient}`);

    // Log to communications
    await logCommunication({
      from: "bookings@localmile.plus",
      to: recipient,
      subject: mailOptions.subject,
      body: taggedHtml,
      type: 'sent',
      metadata: metadata
    });
  } catch (error) {
    console.error("[Daily Report Error] Failed to send scheduled jobs report:", error);
  }
});

/**
 * DAILY REPORT: 4:30 PM Sydney Time (Weekdays)
 * Shows all jobs in "Accepted" or "In-Progress" status.
 */
export const sendInProgressJobsReport = onSchedule({
  schedule: "30 16 * * 1-5",
  timeZone: "Australia/Sydney",
  secrets: [gmailAppPassword],
}, async (event) => {
  const { todayStr, jobs } = await fetchDailyJobReportData(['accepted', 'in-progress']);

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "bookings@localmile.plus",
      pass: gmailAppPassword.value(),
    },
  });

  const reportDate = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const recipient = "dispatcher@mailplus.com.au";

  let jobRows = "";
  jobs.forEach(job => {
    const statusPill = `<span style="background: ${job.status === 'in-progress' ? '#e0f2fe' : '#f0fdf4'}; color: ${job.status === 'in-progress' ? '#0369a1' : '#15803d'}; padding: 2px 8px; border-radius: 12px; font-size: 11px; text-transform: uppercase; font-weight: bold;">${job.status}</span>`;
    jobRows += `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">${job.lpoName}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee;"><strong>${job.customerName}</strong></td>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">${statusPill}</td>
        <td style="padding: 12px; border-bottom: 1px solid #eee; font-family: monospace; color: #666;">#${job.id.substring(0, 8).toUpperCase()}</td>
      </tr>
    `;
  });

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        .container { font-family: 'Fraunces', serif; max-width: 700px; margin: 0 auto; color: #333; }
        .header { background-color: #1A3D33; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
        .header h1 { color: #ffffff; margin: 0; font-size: 24px; font-weight: 300; }
        .header span { color: #EAF044; font-weight: bold; }
        .info-bar { background-color: #f0f9ff; border-left: 4px solid #0ea5e9; padding: 20px; margin: 20px 0; }
        .stats { display: flex; gap: 20px; margin-bottom: 30px; }
        .stat-box { background: #f8f9fa; padding: 15px; border-radius: 8px; flex: 1; text-align: center; border: 1px solid #eee; }
        .stat-value { font-size: 24px; font-weight: bold; color: #1A3D33; }
        .stat-label { font-size: 12px; color: #666; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; }
        th { text-align: left; background: #f4f7f8; padding: 12px; color: #1A3D33; font-weight: bold; }
        .footer { padding: 30px; text-align: center; font-size: 12px; color: #999; background: #f4f7f8; border-radius: 0 0 12px 12px; margin-top: 30px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>LocalMile<span>.Plus</span> | Daily Progress Report</h1>
        </div>
        <div class="info-bar">
          <p style="margin: 0; color: #0369a1;"><strong>End of Day Update:</strong> Summary of jobs currently being performed or accepted for today.</p>
        </div>
        <div class="stats">
          <div class="stat-box">
            <div class="stat-value">${jobs.length}</div>
            <div class="stat-label">Active Jobs</div>
          </div>
          <div class="stat-box">
            <div class="stat-value">${reportDate}</div>
            <div class="stat-label">Report Date</div>
          </div>
        </div>
        ${jobs.length > 0 ? `
          <table>
            <thead>
              <tr>
                <th>Parent</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Job Reference</th>
              </tr>
            </thead>
            <tbody>
              ${jobRows}
            </tbody>
          </table>
        ` : `<p style="text-align: center; padding: 40px; background: #fdfdfd; border: 1px dashed #ccc; border-radius: 8px;">No active jobs remaining for today.</p>`}
        <div style="text-align: center; margin-top: 30px;">
          <a href="https://localmile.plus/dashboard" style="background: #1A3D33; color: white; padding: 12px 25px; text-decoration: none; border-radius: 6px; font-weight: bold;">VIEW JOB MANAGER</a>
        </div>
        <div class="footer">
          <p>This is an automated system notification from LocalMile.Plus</p>
          <p>&copy; ${new Date().getFullYear()} LocalMile.Plus | Premium Logistics Solutions</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const metadata = {
    type: 'daily_report_in_progress',
    date: todayStr,
    jobCount: jobs.length
  };

  const taggedHtml = injectMetadataTag(html, metadata);

  const mailOptions = {
    from: '"LocalMile.Plus Manifest" <bookings@localmile.plus>',
    to: recipient,
    subject: `Daily Manifest Update: Active Jobs (${todayStr})`,
    html: taggedHtml,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[Daily Report] In-progress report sent to ${recipient}`);

    // Log to communications
    await logCommunication({
      from: "bookings@localmile.plus",
      to: recipient,
      subject: mailOptions.subject,
      body: taggedHtml,
      type: 'sent',
      metadata: metadata
    });
  } catch (error) {
    console.error("[Daily Report Error] Failed to send in-progress report:", error);
  }
});

/**
 * DAILY PERFORMANCE REPORT: 6:00 AM Sydney Time (Daily)
 * Summarizes the previous day's performance for each LPO.
 */
export const sendDailyPerformanceReport = onSchedule({
  schedule: "0 6 * * *",
  timeZone: "Australia/Sydney",
  secrets: [gmailAppPassword],
}, async (event) => {
  const db = getDB();

  // 1. Calculate Yesterday in Sydney
  const sydneyTimeFormatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric', month: '2-digit', day: '2-digit'
  });

  const now = new Date();
  const parts = sydneyTimeFormatter.formatToParts(now);
  let y = '', m = '', d = '';
  for (const part of parts) {
    if (part.type === 'year') y = part.value;
    if (part.type === 'month') m = part.value;
    if (part.type === 'day') d = part.value;
  }

  const todayInSydney = new Date(`${y}-${m}-${d}T00:00:00`);
  const yesterdayDate = new Date(todayInSydney);
  yesterdayDate.setDate(todayInSydney.getDate() - 1);

  const yParts = sydneyTimeFormatter.formatToParts(yesterdayDate);
  let yy = '', mm = '', dd = '';
  for (const part of yParts) {
    if (part.type === 'year') yy = part.value;
    if (part.type === 'month') mm = part.value;
    if (part.type === 'day') dd = part.value;
  }
  const yesterdayStr = `${yy}-${mm}-${dd}`;
  const displayDate = yesterdayDate.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  console.log(`[Performance Report] Generating for ${yesterdayStr}`);

  // 2. Fetch all jobs for yesterday
  const jobsSnapshot = await db.collection('jobs').where('date', '==', yesterdayStr).get();
  const jobsByLpo: { [key: string]: any[] } = {};

  jobsSnapshot.forEach(doc => {
    const data = doc.data();
    const parentId = data.parent_id;
    if (!parentId) return;
    if (!jobsByLpo[parentId]) jobsByLpo[parentId] = [];
    jobsByLpo[parentId].push({ id: doc.id, ...data });
  });

  // 3. Fetch all users to know who to notify
  const usersSnapshot = await db.collection('users').get();
  const usersByLpo: { [key: string]: string[] } = {};

  usersSnapshot.forEach(doc => {
    const data = doc.data();
    const parentId = data.parent_id;
    const email = data.email;
    if (parentId && email) {
      if (!usersByLpo[parentId]) usersByLpo[parentId] = [];
      usersByLpo[parentId].push(email);
    }
  });

  // 4. Fetch LPO names for better reporting
  const lpoSnapshot = await db.collection('lpo').get();
  const lpoNames: { [key: string]: string } = {};
  lpoSnapshot.forEach(doc => {
    lpoNames[doc.id] = doc.data()?.name || "Unknown Parent";
  });

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: "bookings@localmile.plus",
      pass: gmailAppPassword.value(),
    },
  });

  const headOfficeCC = ["dispatcher@mailplus.com.au", "michael.mcdaid@mailplus.com.au", "kerry.oneill@mailplus.com.au"];

  // 5. Generate and Send Reports
  for (const parentId in usersByLpo) {
    const recipientList = usersByLpo[parentId];
    const lpoJobs = jobsByLpo[parentId] || [];
    const lpoName = lpoNames[parentId] || "Your Parent Account";

    if (recipientList.length === 0 || lpoJobs.length === 0) continue;

    // Calculate Summary Stats
    const stats = {
      completed: lpoJobs.filter(j => j.status === 'completed').length,
      cancelled: lpoJobs.filter(j => j.status === 'cancelled').length,
      scheduled: lpoJobs.filter(j => j.status === 'scheduled').length,
      inProgress: lpoJobs.filter(j => j.status === 'in-progress').length,
    };

    let detailRows = "";
    lpoJobs.forEach(j => {
      const statusColor = j.status === 'completed' ? '#15803d' : (j.status === 'cancelled' ? '#dc2626' : '#92400e');
      detailRows += `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${j.customer?.company || 'Unknown'}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; text-transform: capitalize;">${j.service?.replace(/-/g, ' ')}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; color: ${statusColor}; font-weight: bold;">${j.status.toUpperCase()}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee; font-family: monospace;">#${j.id.substring(0, 8).toUpperCase()}</td>
        </tr>
      `;
    });

    const html = `
      <div style="font-family: 'Fraunces', serif; max-width: 700px; margin: 0 auto; color: #333;">
        <div style="background-color: #1A3D33; padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">LocalMile.Plus | Performance Summary</h1>
          <p style="color: #EAF044; margin: 5px 0 0 0; font-weight: bold;">${lpoName}</p>
        </div>
        
        <div style="padding: 30px; background: white; border: 1px solid #eee;">
          <h2 style="margin-top: 0; color: #1A3D33; font-size: 18px;">Performance Review: ${displayDate}</h2>
          
          <div style="display: flex; gap: 10px; margin: 20px 0;">
            <div style="flex: 1; background: #f0fdf4; padding: 15px; border-radius: 8px; border: 1px solid #dcfce7; text-align: center;">
              <div style="font-size: 20px; font-weight: bold; color: #15803d;">${stats.completed}</div>
              <div style="font-size: 11px; color: #15803d; text-transform: uppercase;">Completed</div>
            </div>
            <div style="flex: 1; background: #fef2f2; padding: 15px; border-radius: 8px; border: 1px solid #fee2e2; text-align: center;">
              <div style="font-size: 20px; font-weight: bold; color: #dc2626;">${stats.cancelled}</div>
              <div style="font-size: 11px; color: #dc2626; text-transform: uppercase;">Cancelled</div>
            </div>
            <div style="flex: 1; background: #fffbeb; padding: 15px; border-radius: 8px; border: 1px solid #fef3c7; text-align: center;">
              <div style="font-size: 20px; font-weight: bold; color: #92400e;">${stats.scheduled + stats.inProgress}</div>
              <div style="font-size: 11px; color: #92400e; text-transform: uppercase;">Unfinished</div>
            </div>
          </div>

          <h3 style="font-size: 14px; color: #666; text-transform: uppercase; margin-top: 30px; border-bottom: 2px solid #EAF044; padding-bottom: 5px;">Daily Activity Log</h3>
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 10px;">
            <thead style="background: #f8fafb;">
              <tr>
                <th style="text-align: left; padding: 10px;">Customer</th>
                <th style="text-align: left; padding: 10px;">Service</th>
                <th style="text-align: left; padding: 10px;">Status</th>
                <th style="text-align: left; padding: 10px;">Ref</th>
              </tr>
            </thead>
            <tbody>
              ${detailRows || '<tr><td colspan="4" style="padding: 30px; text-align: center; color: #999;">No jobs recorded for this period.</td></tr>'}
            </tbody>
          </table>
          
          <div style="text-align: center; margin-top: 40px;">
            <a href="https://localmile.plus/dashboard" style="background: #1A3D33; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">GO TO JOB MANAGER</a>
          </div>
        </div>

        <div style="padding: 30px; text-align: center; font-size: 12px; color: #999; background: #f4f7f8; border-radius: 0 0 12px 12px;">
          <p>This report was automatically generated by LocalMile.Plus for ${lpoName} users.</p>
          <p>&copy; ${new Date().getFullYear()} LocalMile.Plus | Premium Logistics Solutions</p>
        </div>
      </div>
    `;

    const metadata = {
      type: 'daily_performance_report',
      parentId: parentId,
      lpoName: lpoName,
      date: yesterdayStr,
      stats: stats
    };

    const taggedHtml = injectMetadataTag(html, metadata);

    const mailOptions = {
      from: '"LocalMile.Plus Reports" <bookings@localmile.plus>',
      to: recipientList.join(","),
      cc: headOfficeCC.join(","),
      subject: `Daily Performance Report: ${lpoName} (${yesterdayStr})`,
      html: taggedHtml,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`[Performance Report] Sent to ${lpoName} (${recipientList.length} users)`);

      // Log to communications
      await logCommunication({
        from: "bookings@localmile.plus",
        to: recipientList.join(","),
        subject: mailOptions.subject,
        body: taggedHtml,
        type: 'sent',
        metadata: metadata
      });
    } catch (error) {
      console.error(`[Performance Report Error] Failed for ${lpoName}:`, error);
    }
  }
});

/**
 * TEST TRIGGER: Manually trigger reports for verification.
 * Visit: .../testReports?type=scheduled|progress|performance
 */
export const testReports = onRequest({
  secrets: [gmailAppPassword],
  cors: true,
}, async (req, res) => {
  const { type } = req.query;

  try {
    if (type === 'scheduled') {
      // @ts-ignore - Triggering the internal handler
      await sendScheduledJobsReport({});
      res.send("Scheduled Jobs Report triggered. Check dispatcher@mailplus.com.au");
    } else if (type === 'progress') {
      // @ts-ignore - Triggering the internal handler
      await sendInProgressJobsReport({});
      res.send("In-Progress Jobs Report triggered. Check dispatcher@mailplus.com.au");
    } else if (type === 'performance') {
      // @ts-ignore - Triggering the internal handler
      await sendDailyPerformanceReport({});
      res.send("Daily Performance Report triggered. Check Parent user emails and CC list.");
    } else {
      res.status(400).send("Provide ?type=scheduled, ?type=progress, or ?type=performance");
    }
  } catch (error: any) {
    res.status(500).send(`Error triggering report: ${error.message}`);
  }
});

// Logic: verifyAddressServiceability (NetSuite API)
export const verifyAddressServiceability = onCall({ invoker: "public" }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }

  const {
    street,
    suite,
    city,
    state,
    zip,
    companyName,
    parentId,
    payment,
    firstName,
    lastName,
    email,
    phone
  } = request.data;

  if (!street || !city || !state || !zip || !firstName || !lastName || !email || !phone) {
    throw new HttpsError("invalid-argument", "Missing required fields for address verification.");
  }

  const url = new URL('https://1048144.extforms.netsuite.com/app/site/hosting/scriptlet.nl');
  url.searchParams.set('script', '2643');
  url.searchParams.set('deploy', '1');
  url.searchParams.set('compid', '1048144');
  url.searchParams.set('ns-at', 'AAEJ7tMQgGpiFMAEaj5fjluvuIQ5nWJX1tlMBVdZnRMcZiL7B4A');
  url.searchParams.set('address1', street);
  if (suite) {
    url.searchParams.set('address2', suite);
  }
  url.searchParams.set('city', city);
  url.searchParams.set('state', state);
  url.searchParams.set('zip', zip);
  if (companyName) {
    url.searchParams.set('companyName', companyName);
  }
  if (parentId) {
    url.searchParams.set('lpoid', parentId);
  }
  if (payment) {
    url.searchParams.set('payment', payment);
  }
  url.searchParams.set('firstname', firstName);
  url.searchParams.set('lastname', lastName);
  url.searchParams.set('email', email);
  url.searchParams.set('phone', phone);
  url.searchParams.set('custentity_firebase_uuid', request.auth.uid);

  console.log(`[NetSuite Verification] Verifying address for ${email} (${companyName || 'No Company'})`);

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[NetSuite Verification] API Error:', errorText);
      throw new HttpsError("internal", `NetSuite API request failed with status ${response.status}`);
    }

    const data = await response.json() as any;
    console.log('[NetSuite Verification] Response:', JSON.stringify(data));

    return {
      success: true,
      isServiceable: data.isServiceable,
      leadID: data.leadID,
      reason: data.isServiceable ? undefined : 'This address is not serviceable.'
    };
  } catch (error: any) {
    console.error('[NetSuite Verification] Flow Error:', error);
    throw new HttpsError("internal", error.message || "Failed to verify address with NetSuite.");
  }
});

// Logic: Accounts Provisioning API
const apiApp = express();
apiApp.use(cors({ origin: true }));
apiApp.use(express.json());

apiApp.post("/api/v1/accounts/provision", async (req: express.Request, res: express.Response) => {
  // 1. Security Check
  const providedKey = req.headers["x-api-key"] || req.query.api_key;
  if (!providedKey || providedKey !== netsuiteApiKey.value()) {
    console.warn("Unauthorized attempt to call Provisioning API");
    res.status(401).send({ success: false, message: "Unauthorized. Please provide a valid X-API-KEY." });
    return;
  }

  try {
    let payload = req.body;

    // Normalize Firestore document format if wrapped in "fields"
    if (payload && payload.fields) {
      const flat: Record<string, any> = {};
      for (const [key, valueObj] of Object.entries(payload.fields)) {
        const val = valueObj as any;
        flat[key] = val.stringValue ?? val.integerValue ?? val.booleanValue ??
          (val.arrayValue ? val.arrayValue.values?.map((item: any) => item.stringValue ?? item.integerValue) : val);
      }
      payload = flat;
    }

    // Validate required fields
    if (!payload.companyId || !payload.email || payload.customerEmail === undefined) {
      res.status(400).send({ success: false, message: "Missing required fields: companyId, email, customerEmail" });
      return;
    }

    const companyId = String(payload.companyId);
    const userEmail = payload.email;

    // 2. Auth Provisioning
    const randomPassword = crypto.randomBytes(16).toString("hex") + "Aa1!";
    let authUser;

    try {
      authUser = await admin.auth().getUserByEmail(userEmail);
    } catch (error: any) {
      if (error.code === "auth/user-not-found") {
        authUser = await admin.auth().createUser({
          email: userEmail,
          password: randomPassword,
          displayName: `${payload.first_name || ""} ${payload.last_name || ""}`.trim(),
        });
      } else {
        throw error;
      }
    }

    const uid = authUser.uid;
    const db = getDB();

    // 3. Generate Security Code
    const securityCode = crypto.randomInt(1000, 10000).toString(); // 4-digit code
    const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000));

    // 4. Firestore Writes (Batch)
    const batch = db.batch();

    // companies Collection
    const companyRef = db.collection("companies").doc(companyId);
    batch.set(companyRef, {
      address1: payload.address1 || "",
      city: payload.city || "",
      companyId: companyId,
      companyName: payload.companyName || "",
      customerEmail: payload.customerEmail || "",
      customerEntityId: payload.customerEntityId || "",
      customerPhone: payload.customerPhone || "",
      customerServiceEmail: payload.customerServiceEmail || "",
      extraWeightCharges: payload.extraWeightCharges || "3.50",
      franchisee: payload.franchisee || "",
      franchiseeTerritoryJSON: payload.franchiseeTerritoryJSON || [],
      servicePMPOInternalID: payload.servicePMPOInternalID || "",
      servicePMPORate: payload.servicePMPORate || "",
      state: payload.state || "",
      street: payload.street || "",
      zip: payload.zip || "",
      trial_credits_balance: 5,
      apName: payload.apName || "",
      apAddr1: payload.apAddr1 || "",
      apStreet: payload.apStreet || "",
      apSuburb: payload.apSuburb || "",
      apState: payload.apState || "",
      apPostcode: payload.apPostcode || "",
      apLatitude: payload.apLatitude || "",
      apLongitude: payload.apLongitude || "",
    }, { merge: true });

    // users Collection
    const userRef = db.collection("users").doc(uid);
    batch.set(userRef, {
      companyId: companyId,
      customer_id: payload.customer_id || companyId,
      email: userEmail,
      first_name: payload.first_name || "",
      hasCompletedTour: typeof payload.hasCompletedTour === "boolean" ? payload.hasCompletedTour : true,
      last_name: payload.last_name || "",
      mobile: payload.mobile || "",
      parent_id: payload.parent_id || "",
      role: payload.role || "customer",
      uid: uid,
      status: "Pending_Activation"
    }, { merge: true });

    // verification_tokens Collection
    const tokenRef = db.collection("verification_tokens").doc(uid);
    batch.set(tokenRef, {
      uid: uid,
      code: securityCode,
      expiresAt: expiresAt
    });

    await batch.commit();

    res.status(200).send({
      success: true,
      message: "Account provisioned successfully.",
      data: {
        uid: uid,
        companyId: companyId,
        securityCode: securityCode
      }
    });

  } catch (error: any) {
    console.error("Provisioning API Error:", error);
    res.status(500).send({ success: false, message: error.message });
  }
});

apiApp.post("/api/v1/accounts/recreate-code", async (req: express.Request, res: express.Response) => {
  const providedKey = req.headers["x-api-key"] || req.query.api_key;
  if (!providedKey || providedKey !== netsuiteApiKey.value()) {
    console.warn("Unauthorized attempt to call Recreate Code API");
    res.status(401).send({ success: false, message: "Unauthorized. Please provide a valid X-API-KEY." });
    return;
  }

  try {
    const { email } = req.body;
    if (!email) {
      res.status(400).send({ success: false, message: "Missing required field: email" });
      return;
    }

    let authUser;
    try {
      authUser = await admin.auth().getUserByEmail(email);
    } catch (error: any) {
      if (error.code === "auth/user-not-found") {
        res.status(404).send({ success: false, message: "User not found for the provided email." });
        return;
      }
      throw error;
    }

    const uid = authUser.uid;
    const db = getDB();

    const securityCode = crypto.randomInt(1000, 10000).toString(); // 4-digit code
    const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000));

    const tokenRef = db.collection("verification_tokens").doc(uid);
    await tokenRef.set({
      uid: uid,
      code: securityCode,
      expiresAt: expiresAt
    }, { merge: true });

    res.status(200).send({
      success: true,
      message: "Security code recreated successfully.",
      data: {
        uid: uid,
        securityCode: securityCode
      }
    });

  } catch (error: any) {
    console.error("Recreate Code API Error:", error);
    res.status(500).send({ success: false, message: error.message });
  }
});

apiApp.patch("/api/v1/companies/:companyId", async (req: express.Request, res: express.Response) => {
  const providedKey = req.headers["x-api-key"] || req.query.api_key;
  if (!providedKey || providedKey !== netsuiteApiKey.value()) {
    console.warn("Unauthorized attempt to call Companies Update API");
    res.status(401).send({ success: false, message: "Unauthorized. Please provide a valid X-API-KEY." });
    return;
  }

  try {
    const { companyId } = req.params;
    let payload = req.body;

    if (!companyId) {
      res.status(400).send({ success: false, message: "Missing required param: companyId" });
      return;
    }

    if (payload && payload.fields) {
      const flat: Record<string, any> = {};
      for (const [key, valueObj] of Object.entries(payload.fields)) {
        const val = valueObj as any;
        flat[key] = val.stringValue ?? val.integerValue ?? val.booleanValue ??
          (val.arrayValue ? val.arrayValue.values?.map((item: any) => item.stringValue ?? item.integerValue) : val);
      }
      payload = flat;
    }

    if (!payload || Object.keys(payload).length === 0) {
      res.status(400).send({ success: false, message: "Empty payload provided" });
      return;
    }

    const db = getDB();
    const companyRef = db.collection("companies").doc(String(companyId));

    const doc = await companyRef.get();
    if (!doc.exists) {
      res.status(404).send({ success: false, message: "Company not found" });
      return;
    }

    await companyRef.update(payload);

    res.status(200).send({
      success: true,
      message: "Company updated successfully."
    });

  } catch (error: any) {
    console.error("Companies Update API Error:", error);
    res.status(500).send({ success: false, message: error.message });
  }
});

apiApp.post("/api/v1/companies/:companyId/scheduled-jobs", async (req: express.Request, res: express.Response) => {
  const providedKey = req.headers["x-api-key"] || req.query.api_key;
  if (!providedKey || providedKey !== prospectplusApiKey.value()) {
    console.warn("Unauthorized attempt to call Scheduled Jobs API");
    res.status(401).send({ success: false, message: "Unauthorized. Please provide a valid X-API-KEY." });
    return;
  }

  try {
    const { companyId } = req.params;
    if (!companyId) {
      res.status(400).send({ success: false, message: "Missing required param: companyId" });
      return;
    }

    const db = getDB();
    const companyRef = db.collection("companies").doc(String(companyId));
    const companyDoc = await companyRef.get();
    if (!companyDoc.exists) {
      res.status(404).send({ success: false, message: `Company ${companyId} not found.` });
      return;
    }

    const companyData = companyDoc.data() || {};
    const parentId = String(req.body.parentId || companyData.franchisee || "");
    if (!parentId) {
      res.status(400).send({ success: false, message: "Missing LPO/Franchisee parentId. Please specify parentId in the payload or ensure the company has a franchisee field set." });
      return;
    }

    const lpoDoc = await db.collection("lpo").doc(parentId).get();
    if (!lpoDoc.exists) {
      res.status(404).send({ success: false, message: `LPO/Franchisee with ID ${parentId} not found.` });
      return;
    }
    const lpoData = lpoDoc.data() || {};

    const { startDate, frequency, service, customer, preferredTime, billing, recipient, auspostContact } = req.body;
    if (!startDate || !frequency || !Array.isArray(frequency) || !service || !customer) {
      res.status(400).send({ success: false, message: "Missing required fields. Required: startDate, frequency (array), service, customer." });
      return;
    }

    if (!customer.company || !customer.address || !customer.suburb || !customer.state || !customer.postcode || !customer.email || !customer.phone) {
      res.status(400).send({ success: false, message: "Missing required customer fields (company, address, suburb, state, postcode, email, phone)." });
      return;
    }

    const rawParentLat = lpoData.latitude ?? lpoData.coordinates?.lat;
    const rawParentLng = lpoData.longitude ?? lpoData.coordinates?.lng;

    const parentLoc = {
      name: lpoData.name || '',
      address: lpoData.address1 || lpoData.address || '',
      suburb: lpoData.city || lpoData.location || lpoData.suburb || '',
      state: lpoData.state || 'NSW',
      postcode: lpoData.zip || lpoData.postcode || '',
      lat: rawParentLat ? parseFloat(rawParentLat) : undefined,
      lng: rawParentLng ? parseFloat(rawParentLng) : undefined
    };

    const customerLoc = {
      name: customer.company,
      address: customer.address,
      suburb: customer.suburb,
      state: customer.state,
      postcode: customer.postcode,
      lat: customer.coordinates?.lat ? parseFloat(customer.coordinates.lat) : undefined,
      lng: customer.coordinates?.lng ? parseFloat(customer.coordinates.lng) : undefined
    };

    const stops: any[] = [];
    if (service === 'site-to-lpo' || service === 'site-to-australia post') {
      stops.push(
        { type: 'pickup', label: 'Pickup Site', locationName: customerLoc.name, address: customerLoc.address, suburb: customerLoc.suburb, state: customerLoc.state, postcode: customerLoc.postcode, lat: customerLoc.lat, lng: customerLoc.lng, sequence: 1, status: 'pending', appJobId: null },
        { type: 'delivery', label: 'Delivery Parent', locationName: parentLoc.name, address: parentLoc.address, suburb: parentLoc.suburb, state: parentLoc.state, postcode: parentLoc.postcode, lat: parentLoc.lat, lng: parentLoc.lng, sequence: 2, status: 'pending', appJobId: null }
      );
    } else if (service === 'lpo-to-site' || service === 'australia post-to-site') {
      stops.push(
        { type: 'pickup', label: 'Pickup Parent', locationName: parentLoc.name, address: parentLoc.address, suburb: parentLoc.suburb, state: parentLoc.state, postcode: parentLoc.postcode, lat: parentLoc.lat, lng: parentLoc.lng, sequence: 1, status: 'pending', appJobId: null },
        { type: 'delivery', label: 'Delivery Site', locationName: customerLoc.name, address: customerLoc.address, suburb: customerLoc.suburb, state: customerLoc.state, postcode: customerLoc.postcode, lat: customerLoc.lat, lng: customerLoc.lng, sequence: 2, status: 'pending', appJobId: null }
      );
    } else if (service === 'round-trip') {
      stops.push(
        { type: 'pickup', label: 'Pickup Parent', locationName: parentLoc.name, address: parentLoc.address, suburb: parentLoc.suburb, state: parentLoc.state, postcode: parentLoc.postcode, lat: parentLoc.lat, lng: parentLoc.lng, sequence: 1, status: 'pending', appJobId: null },
        { type: 'delivery', label: 'Delivery Site', locationName: customerLoc.name, address: customerLoc.address, suburb: customerLoc.suburb, state: customerLoc.state, postcode: customerLoc.postcode, lat: customerLoc.lat, lng: customerLoc.lng, sequence: 2, status: 'pending', appJobId: null },
        { type: 'pickup', label: 'Pickup Site', locationName: customerLoc.name, address: customerLoc.address, suburb: customerLoc.suburb, state: customerLoc.state, postcode: customerLoc.postcode, lat: customerLoc.lat, lng: customerLoc.lng, sequence: 3, status: 'pending', appJobId: null },
        { type: 'delivery', label: 'Delivery Parent', locationName: parentLoc.name, address: parentLoc.address, suburb: parentLoc.suburb, state: parentLoc.state, postcode: parentLoc.postcode, lat: parentLoc.lat, lng: parentLoc.lng, sequence: 4, status: 'pending', appJobId: null }
      );
    }

    let serviceInternalId = '';
    let serviceRate = '';
    if (service === 'lpo-to-site' || service === 'australia post-to-site') {
      serviceInternalId = companyData.serviceAMPOInternalID || '';
      serviceRate = companyData.serviceAMPORate || '';
    } else if (service === 'site-to-lpo' || service === 'site-to-australia post') {
      serviceInternalId = companyData.servicePMPOInternalID || '';
      serviceRate = companyData.servicePMPORate || '';
    }

    const newScheduledJob = {
      customer_id: companyId,
      parent_id: parentId,
      status: 'scheduled',
      recurrenceStatus: 'active',
      skippedDates: [],
      frequency,
      preferredTime: preferredTime || null,
      billing: billing || 'credit',
      date: startDate,
      jobType: 'scheduled',
      service,
      customer: {
        company: customer.company,
        address: customer.address,
        suburb: customer.suburb,
        state: customer.state,
        postcode: customer.postcode,
        email: customer.email,
        phone: customer.phone,
        firstName: customer.firstName || '',
        lastName: customer.lastName || '',
        coordinates: customer.coordinates || null
      },
      recipient: recipient || null,
      auspostContact: auspostContact || null,
      stops,
      serviceInternalId: req.body.serviceInternalId || serviceInternalId || null,
      serviceRate: req.body.serviceRate || serviceRate || null,
      createdAt: admin.firestore.Timestamp.now(),
      originalRequestId: req.body.originalRequestId || null,
      operatorNetSuiteId: null,
      operatorName: null,
      operatorEmail: null,
      operatorPhone: null
    };

    const docRef = await db.collection("scheduled_jobs").add(newScheduledJob);

    res.status(201).send({
      success: true,
      message: "Scheduled job created successfully.",
      data: {
        id: docRef.id
      }
    });

  } catch (error: any) {
    console.error("Scheduled Jobs Creation API Error:", error);
    res.status(500).send({ success: false, message: error.message });
  }
});

// Logic: resendActivationCode (Public)
export const resendActivationCode = onCall({ invoker: "public", secrets: [prospectplusApiKey] }, async (request) => {
  const { uid } = request.data;
  if (!uid) {
    throw new HttpsError("invalid-argument", "Missing required fields.");
  }

  const db = getDB();

  try {
    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) {
      throw new HttpsError("not-found", "User not found.");
    }
    
    if (userDoc.data()?.status === "Active") {
      throw new HttpsError("failed-precondition", "User is already active.");
    }
    
    const email = userDoc.data()?.email;
    if (!email) {
      throw new HttpsError("failed-precondition", "User has no email associated.");
    }

    const securityCode = crypto.randomInt(1000, 10000).toString(); // 4-digit code
    const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000));

    const tokenRef = db.collection("verification_tokens").doc(uid);
    await tokenRef.set({
      uid: uid,
      code: securityCode,
      expiresAt: expiresAt
    }, { merge: true });

    const localMilePlusAuthLink = `https://localmile.plus/activate/${uid}`;
    let contactFirstName = userDoc.data()?.firstName || "Valued Customer";

    const response = await fetch('https://prospectplus.com.au/api/localmile/resend-auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': prospectplusApiKey.value()
      },
      body: JSON.stringify({
        contactEmail: email,
        contactFirstName,
        securityCode,
        localMilePlusAuthLink
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`ProspectPlus API failed with status ${response.status}: ${errText}`);
    }

    const data = await response.json() as any;
    if (!data.success) {
      throw new Error(data.message || 'Unknown error from ProspectPlus API');
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error resending activation code:", error);
    throw new HttpsError("internal", error.message);
  }
});

export const activateAccount = onCall({ invoker: "public" }, async (request) => {
  const { uid, code, newPassword } = request.data;

  if (!uid || !code || !newPassword) {
    throw new HttpsError("invalid-argument", "Missing required fields.");
  }

  const db = getDB();
  const tokenRef = db.collection("verification_tokens").doc(uid);
  const tokenDoc = await tokenRef.get();

  if (!tokenDoc.exists) {
    throw new HttpsError("not-found", "Invalid or expired activation link.");
  }

  const tokenData = tokenDoc.data();
  if (tokenData?.code !== code) {
    throw new HttpsError("permission-denied", "Invalid activation code.");
  }

  if (tokenData?.expiresAt.toDate() < new Date()) {
    throw new HttpsError("permission-denied", "Activation link has expired.");
  }

  try {
    // 1. Update password
    await admin.auth().updateUser(uid, { password: newPassword });

    // 2. Mark user active
    await db.collection("users").doc(uid).update({ status: "Active" });

    // 3. Delete token
    await tokenRef.delete();

    // 4. Generate custom token for auto-login
    const customToken = await admin.auth().createCustomToken(uid);

    return { success: true, customToken };
  } catch (error: any) {
    console.error("Account Activation Error:", error);
    throw new HttpsError("internal", error.message);
  }
});

apiApp.get("/api/v1/jobs", async (req: express.Request, res: express.Response) => {
  const providedKey = req.headers["x-api-key"] || req.query.api_key;
  if (!providedKey || (providedKey !== netsuiteApiKey.value() && providedKey !== prospectplusApiKey.value())) {
    console.warn("Unauthorized attempt to call GET Jobs API");
    res.status(401).send({ success: false, message: "Unauthorized. Please provide a valid X-API-KEY." });
    return;
  }

  try {
    const dateSubmitted = req.query.date as string;
    if (!dateSubmitted) {
      res.status(400).send({ success: false, message: "Missing required query param: date (YYYY-MM-DD)" });
      return;
    }

    const db = getDB();
    const jobsSnapshot = await db.collection("jobs").where("date", "==", dateSubmitted).get();

    const jobs: any[] = [];
    jobsSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.syncedWithNetSuite == null) {
        jobs.push({ id: doc.id, ...data });
      }
    });

    res.status(200).send({
      success: true,
      data: jobs
    });
  } catch (error: any) {
    console.error("GET Jobs API Error:", error);
    res.status(500).send({ success: false, message: error.message });
  }
});

export const api = onRequest({ secrets: [netsuiteApiKey, prospectplusApiKey], cors: true }, apiApp);

// Admin Callable Function: Recreate Security Code
export const adminRecreateSecurityCode = onCall({ invoker: "public" }, async (request) => {
  const { email } = request.data;
  if (!email) {
    throw new HttpsError("invalid-argument", "Missing email.");
  }

  if (!request.auth || !request.auth.token.email) {
    throw new HttpsError("unauthenticated", "You must be authenticated.");
  }

  // Verify superadmin
  const callerUser = await admin.auth().getUser(request.auth.uid);
  const callerRole = callerUser.customClaims?.role;
  if (callerRole !== "superadmin" && request.auth.token.email !== "ankith.ravindran@mailplus.com.au") {
    throw new HttpsError("permission-denied", "Only superadmins can recreate security codes.");
  }

  try {
    const authUser = await admin.auth().getUserByEmail(email);
    const uid = authUser.uid;
    const db = getDB();

    const securityCode = crypto.randomInt(1000, 10000).toString(); // 4-digit code
    const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000));

    const tokenRef = db.collection("verification_tokens").doc(uid);
    await tokenRef.set({
      uid: uid,
      code: securityCode,
      expiresAt: expiresAt
    }, { merge: true });

    return { success: true, securityCode, uid };
  } catch (error: any) {
    console.error("Error recreating security code:", error);
    throw new HttpsError("internal", error.message);
  }
});

// Admin Callable Function: Resend Auth Email
export const adminResendAuthEmail = onCall({ invoker: "public", secrets: [prospectplusApiKey] }, async (request) => {
  const { email } = request.data;
  if (!email) {
    throw new HttpsError("invalid-argument", "Missing email.");
  }

  if (!request.auth || !request.auth.token.email) {
    throw new HttpsError("unauthenticated", "You must be authenticated.");
  }

  // Verify superadmin
  const callerUser = await admin.auth().getUser(request.auth.uid);
  const callerRole = callerUser.customClaims?.role;
  if (callerRole !== "superadmin" && request.auth.token.email !== "ankith.ravindran@mailplus.com.au") {
    throw new HttpsError("permission-denied", "Only superadmins can resend auth emails.");
  }

  try {
    const authUser = await admin.auth().getUserByEmail(email);
    const uid = authUser.uid;
    const db = getDB();

    const tokenDoc = await db.collection("verification_tokens").doc(uid).get();
    if (!tokenDoc.exists) {
      throw new Error("No active verification token found for this user.");
    }
    const securityCode = tokenDoc.data()?.code;
    const localMilePlusAuthLink = `https://localmile.plus/activate/${uid}`;

    // Get user details to get customerName
    const userDoc = await db.collection("users").doc(uid).get();
    let contactFirstName = "Valued Customer";
    if (userDoc.exists) {
      contactFirstName = userDoc.data()?.firstName || "Valued Customer";
    }

    const response = await fetch('https://prospectplus.com.au/api/localmile/resend-auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': prospectplusApiKey.value()
      },
      body: JSON.stringify({
        contactEmail: email,
        contactFirstName,
        securityCode,
        localMilePlusAuthLink
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`ProspectPlus API failed with status ${response.status}: ${errText}`);
    }

    const data = await response.json() as any;
    if (!data.success) {
      throw new Error(data.message || 'Unknown error from ProspectPlus API');
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error resending auth email:", error);
    throw new HttpsError("internal", error.message);
  }
});
