using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;

[assembly: AssemblyTitle("Sift")]
[assembly: AssemblyProduct("Sift Desktop")]
[assembly: AssemblyDescription("Intelligent file organizer and clutter cleaner for Windows")]
[assembly: AssemblyVersion("2.0.0.0")]

namespace SiftDesktop
{
    public static class Program
    {
        public static string FindNodeExecutable(string baseDir = null)
        {
            try
            {
                // 0. Check application root or bin folder
                if (!string.IsNullOrEmpty(baseDir))
                {
                    string localNode = Path.Combine(baseDir, "node.exe");
                    if (File.Exists(localNode)) return localNode;
                    string binNode = Path.Combine(baseDir, @"bin\node.exe");
                    if (File.Exists(binNode)) return binNode;
                }

                // 1. Check user local app data (specific version found on this PC)
                string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string specificNode = Path.Combine(localAppData, @"Programs\nodejs\node-v24.19.0-win-x64\node.exe");
                if (File.Exists(specificNode)) return specificNode;

                // 2. Scan %LOCALAPPDATA%\Programs\nodejs
                string nodejsDir = Path.Combine(localAppData, @"Programs\nodejs");
                if (Directory.Exists(nodejsDir))
                {
                    string direct = Path.Combine(nodejsDir, "node.exe");
                    if (File.Exists(direct)) return direct;

                    foreach (string sub in Directory.GetDirectories(nodejsDir))
                    {
                        string candidate = Path.Combine(sub, "node.exe");
                        if (File.Exists(candidate)) return candidate;
                    }
                }

                // 3. Check Program Files
                string progFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
                string pfNode = Path.Combine(progFiles, @"nodejs\node.exe");
                if (File.Exists(pfNode)) return pfNode;

                string progFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
                string pfX86Node = Path.Combine(progFilesX86, @"nodejs\node.exe");
                if (File.Exists(pfX86Node)) return pfX86Node;

                // 4. Search PATH
                string pathEnv = Environment.GetEnvironmentVariable("PATH") ?? "";
                foreach (string p in pathEnv.Split(';'))
                {
                    string trimmed = p.Trim();
                    if (!string.IsNullOrEmpty(trimmed) && Directory.Exists(trimmed))
                    {
                        string candidate = Path.Combine(trimmed, "node.exe");
                        if (File.Exists(candidate)) return candidate;
                    }
                }
            }
            catch { }

            return null;
        }

        private static bool IsPortListening(int port)
        {
            try
            {
                using (var client = new TcpClient())
                {
                    var result = client.BeginConnect("127.0.0.1", port, null, null);
                    bool success = result.AsyncWaitHandle.WaitOne(200);
                    if (success && client.Connected)
                    {
                        client.EndConnect(result);
                        return true;
                    }
                }
            }
            catch { }
            return false;
        }

        private static void LaunchAppWindow(string url)
        {
            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

            // Candidate 1: Google Chrome in app mode (fast, native frameless window)
            string[] chromePaths = new string[]
            {
                @"C:\Program Files\Google\Chrome\Application\chrome.exe",
                @"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
                Path.Combine(localAppData, @"Google\Chrome\Application\chrome.exe")
            };
            foreach (string p in chromePaths)
            {
                if (File.Exists(p))
                {
                    try
                    {
                        ProcessStartInfo psi = new ProcessStartInfo
                        {
                            FileName = p,
                            Arguments = "--app=" + url + " --window-size=1200,820 --no-first-run",
                            UseShellExecute = true
                        };
                        Process.Start(psi);
                        return;
                    }
                    catch { }
                }
            }

            // Candidate 2: Microsoft Edge in app mode
            string[] edgePaths = new string[]
            {
                @"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
                @"C:\Program Files\Microsoft\Edge\Application\msedge.exe"
            };
            foreach (string p in edgePaths)
            {
                if (File.Exists(p))
                {
                    try
                    {
                        ProcessStartInfo psi = new ProcessStartInfo
                        {
                            FileName = p,
                            Arguments = "--app=" + url + " --window-size=1200,820 --no-first-run",
                            UseShellExecute = true
                        };
                        Process.Start(psi);
                        return;
                    }
                    catch { }
                }
            }

            // Candidate 3: Default Windows browser (guaranteed to succeed)
            try
            {
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                MessageBox.Show("Could not open browser:\n" + ex.Message, "Sift Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        [STAThread]
        public static void Main(string[] args)
        {
            try
            {
                string dir = AppDomain.CurrentDomain.BaseDirectory;
                string hostScript = Path.Combine(dir, @"native-host\sift-desktop-host.mjs");

                if (!File.Exists(hostScript))
                {
                    MessageBox.Show(
                        "Could not locate Sift host script:\n" + hostScript,
                        "Sift Error",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Error
                    );
                    return;
                }

                string appUrl = "http://127.0.0.1:14205";

                // If backend server is not already listening on port 14205, start it
                if (!IsPortListening(14205))
                {
                    string nodeExe = FindNodeExecutable(dir);
                    if (string.IsNullOrEmpty(nodeExe))
                    {
                        MessageBox.Show(
                            "Node.js was not found on your system.\n\nPlease install Node.js (v18+) to run Sift.",
                            "Sift - Node.js Required",
                            MessageBoxButtons.OK,
                            MessageBoxIcon.Warning
                        );
                        return;
                    }

                    ProcessStartInfo nodePsi = new ProcessStartInfo
                    {
                        FileName = nodeExe,
                        Arguments = "\"" + hostScript + "\" --no-window",
                        WorkingDirectory = dir,
                        WindowStyle = ProcessWindowStyle.Hidden,
                        CreateNoWindow = true,
                        UseShellExecute = false
                    };

                    Process.Start(nodePsi);

                    // Wait up to 5 seconds for port to open
                    for (int i = 0; i < 50; i++)
                    {
                        Thread.Sleep(100);
                        if (IsPortListening(14205)) break;
                    }
                }

                if (!IsPortListening(14205))
                {
                    MessageBox.Show(
                        "Sift background engine is taking longer than expected to start.\nPlease try running Sift.bat directly.",
                        "Sift Warning",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Warning
                    );
                }

                // Open the desktop application window
                LaunchAppWindow(appUrl);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "Error launching Sift:\n\n" + ex.Message,
                    "Sift Error",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }
        }
    }
}
