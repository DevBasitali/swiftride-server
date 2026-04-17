import axios from "axios";

const EXPECTED_AUDIENCE = process.env.GOOGLE_CLIENT_ID;

export const verifyGoogleToken = async (idToken) => {
  try {
    const response = await axios.get(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`
    );

    const payload = response.data;

    // Verify Audience
    if (payload.aud !== EXPECTED_AUDIENCE) {
      console.error(`Audience Mismatch! Expected ${EXPECTED_AUDIENCE} but got ${payload.aud}`);
      throw new Error("Token audience mismatch (Invalid Client ID)");
    }

    return payload; // Returns { email, name, picture, sub, etc. }
  } catch (error) {
    console.error("Token verification failed details:", error.response?.data || error.message);
    throw new Error("Invalid Google/Firebase Token");
  }
};


export const getGoogleProfile = async (accessToken) => {
  try {
    
    // Call Google's UserInfo Endpoint
    const response = await axios.get("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`, // Use the access token here
      },
    });

    // This will return the FULL profile (Name, Picture, Email)
    const userData = response.data;
    return {
      name: userData.name,
      email: userData.email,
      picture: userData.picture, // High quality image URL
      googleId: userData.sub
    };

  } catch (error) {
    console.error("Google Profile Fetch Failed:", error.response?.data || error.message);
    throw new Error("Invalid Google Access Token");
  }
};

// export function getGoogleProfile;