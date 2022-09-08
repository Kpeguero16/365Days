import java.awt.Color;
import java.awt.Font;

import javax.swing.BorderFactory;
import javax.swing.JFrame;
import javax.swing.JLabel;
import javax.swing.border.Border;

public class Main {
    public static void main(String[] args) {

        Border border = BorderFactory.createLineBorder(new Color(255, 250, 250), 2);

        JLabel introduction = new JLabel("0. Introduction");
        // introduction.setText("0. Introduction");
        // introduction.setIcon(image);
        introduction.setForeground(new Color(255, 250, 250));
        introduction.setFont(new Font("Times New Roman",Font.BOLD, 16));
        introduction.setBorder(border);
        introduction.setHorizontalAlignment(JLabel.CENTER);
        introduction.setBounds(100,150, 225, 400);

        JLabel september = new JLabel();
        september.setText("1. September");
        september.setForeground(new Color(255, 250, 250));
        september.setFont(new Font("Times New Roman",Font.BOLD, 16));
        september.setBorder(border);
        september.setHorizontalAlignment(JLabel.CENTER);


        JFrame frame = new JFrame();
        frame.setTitle("365 Days");
        frame.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        frame.setResizable(false);
        frame.setSize(450,800);
        frame.setLayout(null);
        frame.setVisible(true); 
        frame.getContentPane().setBackground(new Color(199,43,80));
        frame.add(introduction);
        frame.add(september);








    }
}